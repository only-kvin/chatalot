-- Call-outs and mobile services: bookings that happen at the customer's
-- address (plumbers, electricians, mobile barbers), alongside the ones at
-- the business. Adds where a service happens, how it's priced, call-out
-- fees and arrival windows; the business's service areas, travel buffer,
-- cancellation policy and emergency settings; the address and agreed fee on
-- each booking; and an urgent flag on conversations and leads.
--
-- No payments: fees are shown and agreed in advance, paid to the business
-- directly.

-- ---------------------------------------------------------------------------
-- Services: where it happens and how it's priced.
-- ---------------------------------------------------------------------------

alter table public.services
  -- business = the customer comes to us; customer = we go to them;
  -- either = the customer chooses when booking.
  add column location text not null default 'business' check (location in ('business', 'customer', 'either')),
  -- fixed = "R350"; from = "from R350"; on_inspection = "quoted on site"
  -- (the AI never states a price for it).
  add column price_type text not null default 'fixed' check (price_type in ('fixed', 'from', 'on_inspection')),
  -- Only charged when the service happens at the customer. Null = none.
  add column callout_fee_cents integer check (callout_fee_cents >= 0),
  -- Null = an exact start time; otherwise customers pick a window such as
  -- 08:00–10:00 (at the customer only).
  add column arrival_window_minutes integer check (arrival_window_minutes between 30 and 480);

-- ---------------------------------------------------------------------------
-- Per-business call-out settings.
-- ---------------------------------------------------------------------------

alter table public.agent_configs
  -- Suburbs and towns covered, as the owner typed them. Matching is
  -- forgiving (lib/bookings/service-area.ts); empty = no area check.
  add column service_areas text[] not null default '{}',
  -- Kept free before and after every booking at the customer's address,
  -- on top of the service's own buffers.
  add column travel_buffer_minutes integer not null default 0 check (travel_buffer_minutes between 0 and 240),
  add column cancellation_policy text not null default '' check (length(cancellation_policy) <= 1000),
  -- Call-outs wait for the owner's approval unless this is on (whatever
  -- bookings_need_approval says). Outside the listed area always waits.
  add column callouts_confirm_instantly boolean not null default false,
  add column emergency_callouts boolean not null default false,
  add column emergency_note text not null default '' check (length(emergency_note) <= 500);

-- ---------------------------------------------------------------------------
-- Bookings: where this one happens.
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column location text not null default 'business' check (location in ('business', 'customer')),
  -- POPIA: personal information. Only the business's own team sees it (RLS
  -- as for the rest of the booking), and it goes with the booking.
  add column address_line text,
  add column suburb text,
  add column city text,
  add column postal_code text,
  add column access_notes text,
  -- starts_at is the window's start; null = an exact-time booking.
  add column arrival_window_end timestamptz,
  -- The fee as agreed when booked, so later price changes don't rewrite it.
  add column callout_fee_cents integer check (callout_fee_cents >= 0),
  -- The suburb didn't match the business's listed areas: it's a request
  -- the owner confirms.
  add column outside_service_area boolean not null default false,
  add constraint bookings_customer_address_check check (
    location = 'business'
    or (length(trim(coalesce(address_line, ''))) > 0 and length(trim(coalesce(suburb, ''))) > 0)
  ),
  add constraint bookings_arrival_window_check check (arrival_window_end is null or arrival_window_end > starts_at);

-- ---------------------------------------------------------------------------
-- Urgent: emergencies the owner must see first.
-- ---------------------------------------------------------------------------

alter table public.conversations add column urgent boolean not null default false;
alter table public.leads add column urgent boolean not null default false;
create index conversations_urgent_idx on public.conversations (tenant_id, last_message_at desc) where urgent;
create index leads_urgent_idx on public.leads (tenant_id, created_at desc) where urgent;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'human_requested', 'new_lead', 'new_booking', 'booking_cancelled', 'booking_rescheduled',
    'reminder_not_sent', 'low_rating', 'approval_needed', 'contact_message', 'urgent'
  ));

-- ---------------------------------------------------------------------------
-- How much calendar a booking takes. One place, used by both functions.
--
-- At the business: the appointment plus the service's buffers, as before.
-- At the customer: the travel buffer is added either side; with an arrival
-- window, the block runs from travel before the window opens to the latest
-- possible finish (window end + job + buffers + travel), so a window can't
-- be double-sold even if the visit starts at the last minute.
-- ---------------------------------------------------------------------------

create function private.booking_block(
  p_starts_at timestamptz,
  p_duration integer,
  p_buffer_before integer,
  p_buffer_after integer,
  p_travel integer,
  p_window integer,
  out block_start timestamptz,
  out block_end timestamptz,
  out ends_at timestamptz,
  out window_end timestamptz
)
language sql
immutable
set search_path = ''
as $$
  select
    p_starts_at - make_interval(mins => p_buffer_before + p_travel),
    p_starts_at + make_interval(mins => coalesce(p_window, 0) + p_duration + p_buffer_after + p_travel),
    p_starts_at + make_interval(mins => p_duration),
    case when p_window is null then null else p_starts_at + make_interval(mins => p_window) end;
$$;

-- ---------------------------------------------------------------------------
-- create_booking(): adds where it happens and the address. The fee, travel
-- buffer and window are read here, under the lock, from the service and
-- the business's settings, never taken from the caller.
-- ---------------------------------------------------------------------------

drop function public.create_booking(uuid, uuid, uuid, timestamptz, text, text, text, uuid, uuid, text, text, jsonb, text, text, text, text, text, uuid, text);

create function public.create_booking(
  p_tenant_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_name text,
  p_phone text,
  p_email text,
  p_contact_id uuid,
  p_conversation_id uuid,
  p_source text,
  p_notes text,
  p_details jsonb,
  p_idempotency_key text,
  -- Lead to file with the booking; no lead when p_lead_source is null.
  p_lead_source text,
  p_lead_summary text,
  p_actor text,
  p_channel text,
  p_created_by uuid,
  p_status text default 'confirmed',
  -- 'business' or 'customer'; must suit the service's location.
  p_location text default 'business',
  p_address_line text default null,
  p_suburb text default null,
  p_city text default null,
  p_postal_code text default null,
  p_access_notes text default null,
  p_outside_service_area boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_service record;
  v_travel integer := 0;
  v_window integer;
  v_fee integer;
  v_capacity integer := 1;
  v_block record;
  v_existing uuid;
  v_lead_id uuid;
  v_booking_id uuid;
begin
  if p_status not in ('confirmed', 'pending') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status');
  end if;
  if p_location not in ('business', 'customer') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_location');
  end if;
  if p_location = 'customer'
     and (length(trim(coalesce(p_address_line, ''))) = 0 or length(trim(coalesce(p_suburb, ''))) = 0) then
    return jsonb_build_object('ok', false, 'reason', 'address_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bookings:' || p_tenant_id::text, 0));

  if p_idempotency_key is not null then
    select id into v_existing from public.bookings
    where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'booking_id', v_existing, 'repeat', true);
    end if;
  end if;

  select name, duration_minutes, buffer_before_min, buffer_after_min, location, callout_fee_cents, arrival_window_minutes
  into v_service
  from public.services
  where id = p_service_id and tenant_id = p_tenant_id and active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_service');
  end if;
  if (v_service.location = 'business' and p_location <> 'business')
     or (v_service.location = 'customer' and p_location <> 'customer') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_location');
  end if;

  if p_location = 'customer' then
    select travel_buffer_minutes into v_travel from public.agent_configs where tenant_id = p_tenant_id;
    v_travel := coalesce(v_travel, 0);
    v_window := v_service.arrival_window_minutes;
    v_fee := v_service.callout_fee_cents;
  end if;

  if p_staff_id is not null then
    select max_concurrent into v_capacity from public.staff
    where id = p_staff_id and tenant_id = p_tenant_id and active;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'unknown_staff');
    end if;
  end if;

  select * into v_block from private.booking_block(
    p_starts_at, v_service.duration_minutes, v_service.buffer_before_min, v_service.buffer_after_min, v_travel, v_window
  );

  if private.overlapping_bookings(p_tenant_id, p_staff_id, v_block.block_start, v_block.block_end, null) >= v_capacity then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end if;

  if p_lead_source is not null then
    insert into public.leads (tenant_id, conversation_id, contact_id, name, phone, email, interest, summary, status, source)
    values (p_tenant_id, p_conversation_id, p_contact_id, p_name, p_phone, p_email, v_service.name, p_lead_summary, 'booked', p_lead_source)
    returning id into v_lead_id;
  end if;

  insert into public.bookings (
    tenant_id, service_id, staff_id, contact_id, conversation_id, lead_id, name, phone, email,
    starts_at, ends_at, block_start, block_end, capacity, status, source, notes, details, idempotency_key,
    location, address_line, suburb, city, postal_code, access_notes, arrival_window_end, callout_fee_cents,
    outside_service_area
  ) values (
    p_tenant_id, p_service_id, p_staff_id, p_contact_id, p_conversation_id, v_lead_id, p_name, p_phone, p_email,
    p_starts_at, v_block.ends_at, v_block.block_start, v_block.block_end, v_capacity, p_status, p_source, coalesce(p_notes, ''),
    coalesce(p_details, '{}'), p_idempotency_key,
    p_location,
    case when p_location = 'customer' then nullif(trim(p_address_line), '') end,
    case when p_location = 'customer' then nullif(trim(p_suburb), '') end,
    case when p_location = 'customer' then nullif(trim(p_city), '') end,
    case when p_location = 'customer' then nullif(trim(p_postal_code), '') end,
    case when p_location = 'customer' then nullif(trim(p_access_notes), '') end,
    v_block.window_end,
    v_fee,
    p_location = 'customer' and coalesce(p_outside_service_area, false)
  )
  returning id into v_booking_id;

  insert into public.booking_events (tenant_id, booking_id, type, actor, channel, created_by)
  values (p_tenant_id, v_booking_id, 'created', p_actor, p_channel, p_created_by);

  return jsonb_build_object('ok', true, 'booking_id', v_booking_id, 'repeat', false);
exception
  -- Something bypassed the lock (a direct insert or status change).
  when exclusion_violation then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
end;
$$;

revoke all on function public.create_booking(uuid, uuid, uuid, timestamptz, text, text, text, uuid, uuid, text, text, jsonb, text, text, text, text, text, uuid, text, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.create_booking(uuid, uuid, uuid, timestamptz, text, text, text, uuid, uuid, text, text, jsonb, text, text, text, text, text, uuid, text, text, text, text, text, text, text, boolean) to authenticated, service_role;
revoke all on function private.booking_block(timestamptz, integer, integer, integer, integer, integer) from public, anon;
grant execute on function private.booking_block(timestamptz, integer, integer, integer, integer, integer) to authenticated, service_role;

-- reschedule_booking(): a moved call-out keeps its address and agreed fee,
-- and blocks the calendar the same way a new one would. Same signature.
create or replace function public.reschedule_booking(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_actor text,
  p_channel text,
  p_created_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking record;
  v_travel integer := 0;
  v_window integer;
  v_capacity integer := 1;
  v_block record;
begin
  perform pg_advisory_xact_lock(hashtextextended('bookings:' || p_tenant_id::text, 0));

  select b.id, b.starts_at, b.staff_id, b.location, s.duration_minutes, s.buffer_before_min, s.buffer_after_min,
         s.arrival_window_minutes
  into v_booking
  from public.bookings b
  join public.services s on s.id = b.service_id
  where b.id = p_booking_id and b.tenant_id = p_tenant_id and b.status in ('confirmed', 'pending')
  for update of b;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;

  if v_booking.location = 'customer' then
    select travel_buffer_minutes into v_travel from public.agent_configs where tenant_id = p_tenant_id;
    v_travel := coalesce(v_travel, 0);
    v_window := v_booking.arrival_window_minutes;
  end if;

  if p_staff_id is not null then
    select max_concurrent into v_capacity from public.staff
    where id = p_staff_id and tenant_id = p_tenant_id and active;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'unknown_staff');
    end if;
  end if;

  select * into v_block from private.booking_block(
    p_starts_at, v_booking.duration_minutes, v_booking.buffer_before_min, v_booking.buffer_after_min, v_travel, v_window
  );

  if private.overlapping_bookings(p_tenant_id, p_staff_id, v_block.block_start, v_block.block_end, p_booking_id) >= v_capacity then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end if;

  update public.bookings set
    starts_at = p_starts_at,
    ends_at = v_block.ends_at,
    block_start = v_block.block_start,
    block_end = v_block.block_end,
    arrival_window_end = v_block.window_end,
    staff_id = p_staff_id,
    capacity = v_capacity,
    -- A new time needs a new reminder.
    reminder_sent_at = null,
    updated_at = now()
  where id = p_booking_id and tenant_id = p_tenant_id;

  insert into public.booking_events (tenant_id, booking_id, type, actor, channel, created_by, details)
  values (
    p_tenant_id, p_booking_id, 'rescheduled', p_actor, p_channel, p_created_by,
    jsonb_strip_nulls(jsonb_build_object(
      'from', v_booking.starts_at,
      'to', p_starts_at,
      'staff_from', case when v_booking.staff_id is distinct from p_staff_id then v_booking.staff_id end,
      'staff_to', case when v_booking.staff_id is distinct from p_staff_id then p_staff_id end
    ))
  );

  return jsonb_build_object('ok', true, 'from', v_booking.starts_at, 'to', p_starts_at);
exception
  when exclusion_violation then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
end;
$$;

-- A direct write that moves a window booking keeps its window length (the
-- trigger already keeps the blocked time in step).
create or replace function private.sync_booking_block() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.block_start := coalesce(new.block_start, new.starts_at);
    new.block_end := coalesce(new.block_end, new.ends_at);
  else
    if new.block_start is not distinct from old.block_start and new.starts_at is distinct from old.starts_at then
      new.block_start := new.starts_at - (old.starts_at - old.block_start);
    end if;
    if new.block_end is not distinct from old.block_end and new.ends_at is distinct from old.ends_at then
      new.block_end := new.ends_at + (old.block_end - old.ends_at);
    end if;
    if old.arrival_window_end is not null and new.arrival_window_end is not distinct from old.arrival_window_end
       and new.starts_at is distinct from old.starts_at then
      new.arrival_window_end := new.starts_at + (old.arrival_window_end - old.starts_at);
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sign-up: trades take call-out requests through the booking engine
-- (bookings no longer switched off), with sensible defaults.
-- ---------------------------------------------------------------------------

create or replace function public.complete_signup(p_user_id uuid, p_email text)
returns table (tenant_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signup public.signups%rowtype;
  v_tenant_id uuid;
  v_base text;
  v_slug text;
  v_n int := 0;
  v_trades boolean;
begin
  select * into v_signup from public.signups s where s.email = lower(p_email) for update;
  if not found then
    raise exception 'no sign-up for this email' using errcode = 'P0002';
  end if;

  if v_signup.tenant_id is not null then
    return query select v_signup.tenant_id, false;
    return;
  end if;

  if exists (select 1 from public.tenant_members m where m.user_id = p_user_id) then
    raise exception 'this account already belongs to a business' using errcode = '23505';
  end if;

  -- A readable, unique slug from the business name: "Glow Studio" -> glow-studio, glow-studio-2...
  v_base := trim(both '-' from regexp_replace(lower(v_signup.business_name), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then v_base := 'business'; end if;
  v_base := left(v_base, 40);
  v_slug := v_base;
  while exists (select 1 from public.tenants t where t.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || (v_n + 1);
  end loop;

  v_trades := v_signup.business_type = 'trades';

  insert into public.tenants (name, slug, status, plan, business_type, feature_overrides)
  values (v_signup.business_name, v_slug, 'pending', 'trial', v_signup.business_type, '{}'::jsonb)
  returning id into v_tenant_id;

  -- Trades: call-outs wait for approval (callouts_confirm_instantly stays
  -- off) and get 30 minutes' travel either side.
  insert into public.agent_configs (tenant_id, business_name, travel_buffer_minutes)
  values (v_tenant_id, v_signup.business_name, case when v_trades then 30 else 0 end);
  insert into public.widget_settings (tenant_id) values (v_tenant_id);
  insert into public.tenant_members (tenant_id, user_id, role) values (v_tenant_id, p_user_id, 'owner');

  if v_trades then
    -- A starter service to adjust. The fee is left for the owner to fill in
    -- (the Overview checklist asks for it).
    insert into public.services (
      tenant_id, name, description, duration_minutes, location, price_type, arrival_window_minutes, sort_order
    ) values (
      v_tenant_id, 'Call-out', 'We come to you, take a look and quote on site.', 60, 'customer', 'on_inspection', 120, 1
    );
  end if;

  update public.signups set tenant_id = v_tenant_id, completed_at = now() where id = v_signup.id;

  return query select v_tenant_id, true;
end;
$$;
