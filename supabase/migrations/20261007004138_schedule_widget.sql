-- Widget suite, Phase C: the schedule widget's server side. Booking
-- approval (pending bookings), customer-made bookings in the history, the
-- shared widget look, and per-widget text, settings and form fields.

-- ---------------------------------------------------------------------------
-- Approval: with it on, new bookings wait as 'pending' until the owner
-- approves or declines. A pending booking holds its slot (the double-booking
-- rules only skip cancelled ones).
-- ---------------------------------------------------------------------------

alter table public.agent_configs
  add column bookings_need_approval boolean not null default false;

alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show'));

-- 'customer' = the customer themselves, e.g. through a booking widget or a
-- link in their email (the AI acting for them stays 'ai').
alter table public.booking_events drop constraint booking_events_actor_check;
alter table public.booking_events add constraint booking_events_actor_check
  check (actor in ('ai', 'team', 'system', 'customer'));

alter table public.booking_events drop constraint booking_events_type_check;
alter table public.booking_events add constraint booking_events_type_check
  check (type in (
    'created', 'rescheduled', 'cancelled', 'attended', 'no_show', 'reopened',
    'approved', 'declined',
    'reminder_sent', 'reminder_not_sent',
    'review_requested', 'review_not_sent', 'review_rated'
  ));

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'human_requested', 'new_lead', 'new_booking', 'booking_cancelled', 'booking_rescheduled',
    'reminder_not_sent', 'low_rating', 'approval_needed'
  ));

-- ---------------------------------------------------------------------------
-- The shared look of the website widgets (schedule now, more later). The
-- chat launcher keeps its own position/text settings and uses primary_color.
-- ---------------------------------------------------------------------------

alter table public.widget_settings
  add column surface_color text not null default '#ffffff' check (surface_color ~ '^#[0-9a-fA-F]{6}$'),
  add column text_color text not null default '#18181b' check (text_color ~ '^#[0-9a-fA-F]{6}$'),
  add column corner_radius smallint not null default 20 check (corner_radius between 0 and 32),
  add column font text not null default 'system'
    check (font in ('system', 'inter', 'poppins', 'lora', 'nunito')),
  add column color_mode text not null default 'light' check (color_mode in ('light', 'dark', 'auto'));

-- One row per business per widget type: its wording, behaviour and form.
create table public.widget_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  type text not null check (type in ('schedule', 'appointment', 'contact', 'registration')),
  -- Labels and messages (title, button text, success message...).
  copy jsonb not null default '{}',
  -- Behaviour toggles (let customers pick staff, show the reminders line...).
  settings jsonb not null default '{}',
  -- The booking form's fields; validated server-side from this, never from
  -- what the browser sends (see lib/widgets/fields.ts).
  fields jsonb not null default '[]',
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (tenant_id, type)
);

alter table public.widget_instances enable row level security;
alter table public.widget_instances force row level security;
revoke all on public.widget_instances from anon;
create policy "tenant isolation" on public.widget_instances
  for all
  to authenticated
  using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()))
  with check (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()));

-- ---------------------------------------------------------------------------
-- Booking functions: create with a status, and pending bookings can be
-- moved like confirmed ones.
-- ---------------------------------------------------------------------------

drop function public.create_booking(uuid, uuid, uuid, timestamptz, text, text, text, uuid, uuid, text, text, jsonb, text, text, text, text, text, uuid);

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
  -- 'confirmed', or 'pending' when the business approves bookings first.
  -- Defaults so callers from before approval existed keep working.
  p_status text default 'confirmed'
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
  if p_status not in ('confirmed', 'pending') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status');
  end if;

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
    starts_at, ends_at, block_start, block_end, capacity, status, source, notes, details, idempotency_key
  ) values (
    p_tenant_id, p_service_id, p_staff_id, p_contact_id, p_conversation_id, v_lead_id, p_name, p_phone, p_email,
    p_starts_at, v_ends_at, v_block_start, v_block_end, v_capacity, p_status, p_source, coalesce(p_notes, ''),
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

revoke all on function public.create_booking(uuid, uuid, uuid, timestamptz, text, text, text, uuid, uuid, text, text, jsonb, text, text, text, text, text, uuid, text) from public, anon;
grant execute on function public.create_booking(uuid, uuid, uuid, timestamptz, text, text, text, uuid, uuid, text, text, jsonb, text, text, text, text, text, uuid, text) to authenticated, service_role;

-- reschedule_booking(): only the status filter changes ('confirmed' ->
-- confirmed or pending). Recreated whole; same signature, so grants stay.
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
  where b.id = p_booking_id and b.tenant_id = p_tenant_id and b.status in ('confirmed', 'pending')
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
