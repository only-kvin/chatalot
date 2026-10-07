-- Widget suite, Phase A: the booking rules the AI and the booking widgets
-- share. Adds optional staff (each with their own calendar and capacity),
-- service buffers, staff time off and per-business booking settings, and
-- moves booking creation and rescheduling into database functions that lock
-- the business's calendar, so two people taking the same slot at once get
-- one booking and one "slot taken".
--
-- A business with no staff keeps working exactly as before: one calendar,
-- one booking at a time, its existing opening hours.

-- ---------------------------------------------------------------------------
-- Services: buffers and widget display.
-- ---------------------------------------------------------------------------

alter table public.services
  -- Time kept free before/after the appointment (setup, cleanup). Blocks the
  -- calendar but isn't part of the customer's appointment.
  add column buffer_before_min integer not null default 0 check (buffer_before_min between 0 and 240),
  add column buffer_after_min integer not null default 0 check (buffer_after_min between 0 and 240),
  add column category text not null default '',
  -- Inactive services can't be booked at all; this hides an active one from
  -- the booking widgets only (e.g. "consultation first, then book").
  add column online_bookable boolean not null default true,
  add column sort_order integer not null default 0,
  -- Lets other tables reference (tenant_id, id), so a row can never point at
  -- another business's service.
  add constraint services_tenant_id_id_key unique (tenant_id, id);

-- ---------------------------------------------------------------------------
-- Staff. Optional: none = the business is one calendar.
-- ---------------------------------------------------------------------------

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  role text not null default '',
  avatar_url text check (avatar_url ~ '^https://'),
  -- Deactivate rather than delete: past bookings keep pointing at them.
  active boolean not null default true,
  -- Bookings at the same time: 1 for a chair, e.g. 12 for a class.
  max_concurrent smallint not null default 1 check (max_concurrent between 1 and 500),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

-- Which staff offer which service. A service with no rows here can be done
-- by any active staff member.
create table public.staff_services (
  tenant_id uuid not null,
  staff_id uuid not null,
  service_id uuid not null,
  primary key (staff_id, service_id),
  foreign key (tenant_id, staff_id) references public.staff (tenant_id, id) on delete cascade,
  foreign key (tenant_id, service_id) references public.services (tenant_id, id) on delete cascade
);
create index staff_services_tenant_service_idx on public.staff_services (tenant_id, service_id);

-- A staff member's absences: a morning, a week's leave. Whole-business
-- closed days stay in availability_exceptions.
create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  staff_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  check (starts_at < ends_at),
  foreign key (tenant_id, staff_id) references public.staff (tenant_id, id) on delete cascade
);
create index time_off_tenant_staff_idx on public.time_off (tenant_id, staff_id, starts_at);

-- Weekly hours: staff_id null = the business's opening hours (every
-- existing row). A staff member with rows of their own works those hours;
-- one without works the business's.
alter table public.availability_rules
  add column staff_id uuid,
  add constraint availability_rules_staff_fkey
    foreign key (tenant_id, staff_id) references public.staff (tenant_id, id) on delete cascade;
create index availability_rules_staff_idx on public.availability_rules (tenant_id, staff_id) where staff_id is not null;

-- ---------------------------------------------------------------------------
-- Per-business booking settings.
-- ---------------------------------------------------------------------------

alter table public.agent_configs
  -- Minimum notice for a new booking.
  add column booking_lead_time_minutes integer not null default 60 check (booking_lead_time_minutes between 0 and 10080),
  -- How far ahead customers can book.
  add column booking_horizon_days integer not null default 60 check (booking_horizon_days between 1 and 365),
  -- Start times offered: every 15, 30 or 60 minutes from opening.
  add column slot_minutes smallint not null default 15 check (slot_minutes in (15, 30, 60));

-- ---------------------------------------------------------------------------
-- Bookings: staff, buffers, capacity, widget fields.
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column staff_id uuid,
  -- The time the booking takes off the calendar: the appointment plus the
  -- service's buffers when it was booked.
  add column block_start timestamptz,
  add column block_end timestamptz,
  -- The calendar's max_concurrent when booked. Only one-at-a-time calendars
  -- are covered by the exclusion constraint below; classes are protected by
  -- the capacity check in create_booking()/reschedule_booking().
  add column capacity smallint not null default 1 check (capacity >= 1),
  -- Answers to the business's custom booking-form fields.
  add column details jsonb not null default '{}',
  -- Sent by the widgets so a double-clicked or retried submit books once.
  add column idempotency_key text check (length(idempotency_key) between 8 and 100),
  add constraint bookings_staff_fkey
    foreign key (tenant_id, staff_id) references public.staff (tenant_id, id) on delete restrict;

update public.bookings set block_start = starts_at, block_end = ends_at;

alter table public.bookings
  alter column block_start set not null,
  alter column block_end set not null,
  add constraint bookings_block_check check (block_start <= starts_at and block_end >= ends_at),
  -- Each staff member is their own calendar; with no staff it's the business.
  add column calendar_id uuid generated always as (coalesce(staff_id, tenant_id)) stored;

alter table public.bookings drop constraint bookings_source_check;
alter table public.bookings add constraint bookings_source_check
  check (source in ('web', 'whatsapp', 'team', 'widget'));

-- Was one booking at a time per business; now per calendar, buffers
-- included. Still the database's own guarantee against double booking for
-- anything that bypasses the functions below.
alter table public.bookings drop constraint bookings_tenant_id_tstzrange_excl;
alter table public.bookings add constraint bookings_calendar_excl
  exclude using gist (calendar_id with =, tstzrange(block_start, block_end) with &&)
  where (status <> 'cancelled' and capacity = 1);

create unique index bookings_idempotency_idx on public.bookings (tenant_id, idempotency_key)
  where idempotency_key is not null;
create index bookings_staff_idx on public.bookings (tenant_id, staff_id, block_start) where staff_id is not null;

-- ---------------------------------------------------------------------------
-- RLS — same tenant isolation as the other booking tables.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['staff', 'staff_services', 'time_off']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy "tenant isolation" on public.%I
         for all
         to authenticated
         using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()))
         with check (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()))',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Booking functions. Every new or moved booking goes through these.
--
-- They take a per-business lock, then count what already overlaps on the
-- calendar, so concurrent requests are decided one at a time. Hours, time
-- off, notice and horizon are checked by the app beforehand
-- (lib/bookings/availability.ts); these guarantee capacity.
--
-- SECURITY INVOKER: the service-role backend (AI, widgets) bypasses RLS; a
-- dashboard user calling them is held to their own business by RLS on every
-- table touched.
-- ---------------------------------------------------------------------------

-- Bookings overlapping [block_start, block_end) on a calendar. Bookings
-- without a staff member count against everyone: they predate the business
-- adding staff, and nobody knows whose chair they're in. For a class every
-- booking shares the same times, so "overlapping" equals "at the same time".
create function private.overlapping_bookings(
  p_tenant_id uuid,
  p_staff_id uuid,
  p_block_start timestamptz,
  p_block_end timestamptz,
  p_exclude_id uuid
) returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.bookings b
  where b.tenant_id = p_tenant_id
    and b.status <> 'cancelled'
    and b.id is distinct from p_exclude_id
    and (p_staff_id is null or b.staff_id is null or b.staff_id = p_staff_id)
    and tstzrange(b.block_start, b.block_end) && tstzrange(p_block_start, p_block_end);
$$;

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
  p_created_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_service record;
  v_capacity integer := 1;
  v_ends_at timestamptz;
  v_block_start timestamptz;
  v_block_end timestamptz;
  v_existing uuid;
  v_lead_id uuid;
  v_booking_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('bookings:' || p_tenant_id::text, 0));

  if p_idempotency_key is not null then
    select id into v_existing from public.bookings
    where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'booking_id', v_existing, 'repeat', true);
    end if;
  end if;

  select name, duration_minutes, buffer_before_min, buffer_after_min into v_service
  from public.services
  where id = p_service_id and tenant_id = p_tenant_id and active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_service');
  end if;

  if p_staff_id is not null then
    select max_concurrent into v_capacity from public.staff
    where id = p_staff_id and tenant_id = p_tenant_id and active;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'unknown_staff');
    end if;
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_minutes);
  v_block_start := p_starts_at - make_interval(mins => v_service.buffer_before_min);
  v_block_end := v_ends_at + make_interval(mins => v_service.buffer_after_min);

  if private.overlapping_bookings(p_tenant_id, p_staff_id, v_block_start, v_block_end, null) >= v_capacity then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end if;

  if p_lead_source is not null then
    insert into public.leads (tenant_id, conversation_id, contact_id, name, phone, email, interest, summary, status, source)
    values (p_tenant_id, p_conversation_id, p_contact_id, p_name, p_phone, p_email, v_service.name, p_lead_summary, 'booked', p_lead_source)
    returning id into v_lead_id;
  end if;

  insert into public.bookings (
    tenant_id, service_id, staff_id, contact_id, conversation_id, lead_id, name, phone, email,
    starts_at, ends_at, block_start, block_end, capacity, source, notes, details, idempotency_key
  ) values (
    p_tenant_id, p_service_id, p_staff_id, p_contact_id, p_conversation_id, v_lead_id, p_name, p_phone, p_email,
    p_starts_at, v_ends_at, v_block_start, v_block_end, v_capacity, p_source, coalesce(p_notes, ''),
    coalesce(p_details, '{}'), p_idempotency_key
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

create function public.reschedule_booking(
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
  v_capacity integer := 1;
  v_ends_at timestamptz;
  v_block_start timestamptz;
  v_block_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('bookings:' || p_tenant_id::text, 0));

  select b.id, b.starts_at, b.staff_id, s.duration_minutes, s.buffer_before_min, s.buffer_after_min
  into v_booking
  from public.bookings b
  join public.services s on s.id = b.service_id
  where b.id = p_booking_id and b.tenant_id = p_tenant_id and b.status = 'confirmed'
  for update of b;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;

  if p_staff_id is not null then
    select max_concurrent into v_capacity from public.staff
    where id = p_staff_id and tenant_id = p_tenant_id and active;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'unknown_staff');
    end if;
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_booking.duration_minutes);
  v_block_start := p_starts_at - make_interval(mins => v_booking.buffer_before_min);
  v_block_end := v_ends_at + make_interval(mins => v_booking.buffer_after_min);

  if private.overlapping_bookings(p_tenant_id, p_staff_id, v_block_start, v_block_end, p_booking_id) >= v_capacity then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end if;

  update public.bookings set
    starts_at = p_starts_at,
    ends_at = v_ends_at,
    block_start = v_block_start,
    block_end = v_block_end,
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

revoke all on function private.overlapping_bookings(uuid, uuid, timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.create_booking(uuid, uuid, uuid, timestamptz, text, text, text, uuid, uuid, text, text, jsonb, text, text, text, text, text, uuid) from public, anon;
revoke all on function public.reschedule_booking(uuid, uuid, uuid, timestamptz, text, text, uuid) from public, anon;
grant execute on function private.overlapping_bookings(uuid, uuid, timestamptz, timestamptz, uuid) to authenticated, service_role;
grant execute on function public.create_booking(uuid, uuid, uuid, timestamptz, text, text, text, uuid, uuid, text, text, jsonb, text, text, text, text, text, uuid) to authenticated, service_role;
grant execute on function public.reschedule_booking(uuid, uuid, uuid, timestamptz, text, text, uuid) to authenticated, service_role;
