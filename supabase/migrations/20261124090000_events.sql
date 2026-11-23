-- Events: a business lists upcoming events (workshops, open days, classes
-- that happen once) with a poster and description, and customers sign up
-- through the events widget, for free or with paid tickets through the
-- business's own PayFast (the payments system from 20261122090000).
--
-- One-off dates; "Duplicate" in the dashboard makes the next one. A sign-up
-- can be for several tickets (up to the event's max_per_signup). Capacity is
-- enforced by create_event_signup() under a row lock, so two people can't
-- take the last spot. A paid sign-up holds its tickets until payment_due_at,
-- like a booking held for payment.

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  -- One or two lines for the card.
  summary text not null default '' check (char_length(summary) <= 300),
  -- The full write-up, plain text (blank lines = paragraphs).
  description text not null default '' check (char_length(description) <= 5000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null default '' check (char_length(location) <= 300),
  -- Path in the event-posters bucket: <tenant_id>/<file>.
  poster_path text check (poster_path is null or char_length(poster_path) <= 300),
  -- null = no limit.
  capacity integer check (capacity between 1 and 100000),
  max_per_signup smallint not null default 1 check (max_per_signup between 1 and 20),
  -- Per ticket; null = free.
  price_cents integer check (price_cents between 100 and 100000000),
  signups_open boolean not null default true,
  -- draft: only in the dashboard; published: on the widget; cancelled: shown
  -- as cancelled, no sign-ups.
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index events_tenant_starts_idx on public.events (tenant_id, starts_at);
create index events_created_by_idx on public.events (created_by) where created_by is not null;

-- ---------------------------------------------------------------------------
-- Sign-ups
-- ---------------------------------------------------------------------------

create table public.event_signups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  -- POPIA: personal information; only the business's own team sees it.
  name text not null check (char_length(trim(name)) between 1 and 120),
  phone text not null check (char_length(phone) <= 40),
  email text check (char_length(email) <= 200),
  quantity smallint not null check (quantity between 1 and 20),
  -- Answers to the business's own form questions.
  details jsonb not null default '{}',
  -- confirmed holds its tickets (a paid one only until payment_due_at);
  -- cancelled frees them.
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  payment_status text not null default 'not_required'
    check (payment_status in ('not_required', 'awaiting', 'paid', 'expired', 'refunded')),
  amount_due_cents integer check (amount_due_cents > 0),
  payment_due_at timestamptz,
  -- Same key twice = the same sign-up (a double-clicked or retried submit).
  idempotency_key text check (char_length(idempotency_key) between 8 and 100),
  widget_id uuid references public.widget_instances (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (payment_status <> 'awaiting' or (amount_due_cents is not null and payment_due_at is not null))
);
create index event_signups_event_idx on public.event_signups (event_id, status);
create index event_signups_tenant_idx on public.event_signups (tenant_id, created_at desc);
create index event_signups_contact_idx on public.event_signups (contact_id) where contact_id is not null;
create index event_signups_widget_idx on public.event_signups (widget_id) where widget_id is not null;
create index event_signups_due_idx on public.event_signups (payment_due_at) where payment_status = 'awaiting';
create unique index event_signups_idempotency_idx on public.event_signups (event_id, idempotency_key) where idempotency_key is not null;

-- Members manage their business's events and see its sign-ups; sign-ups are
-- created only through create_event_signup() (service role).
alter table public.events enable row level security;
alter table public.events force row level security;
revoke all on public.events from anon;
create policy "tenant isolation" on public.events
  for all to authenticated
  using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()))
  with check (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()));

alter table public.event_signups enable row level security;
alter table public.event_signups force row level security;
revoke all on public.event_signups from anon;
revoke insert, delete on public.event_signups from authenticated;
-- The team can cancel a sign-up (status) but not rewrite who signed up.
revoke update on public.event_signups from authenticated;
grant update (status, updated_at) on public.event_signups to authenticated;
create policy "members read sign-ups" on public.event_signups
  for select to authenticated
  using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()));
create policy "members cancel sign-ups" on public.event_signups
  for update to authenticated
  using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()))
  with check (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()));

-- Posters: public (shown on business websites), files under <tenant_id>/,
-- written only by dashboard server actions with the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-posters', 'event-posters', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- The events widget, and its alerts.
alter table public.widget_instances drop constraint widget_instances_type_check;
alter table public.widget_instances add constraint widget_instances_type_check
  check (type in ('schedule', 'appointment', 'contact', 'registration', 'events'));

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'human_requested', 'new_lead', 'new_booking', 'booking_cancelled', 'booking_rescheduled',
    'reminder_not_sent', 'low_rating', 'approval_needed', 'contact_message', 'urgent',
    'payment_received', 'payment_problem', 'event_signup'
  ));

-- ---------------------------------------------------------------------------
-- Tickets taken: confirmed sign-ups, minus paid holds that ran out.
-- ---------------------------------------------------------------------------

create function public.event_tickets_taken(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(quantity), 0)::integer
  from public.event_signups
  where event_id = p_event_id
    and status = 'confirmed'
    and not (payment_status = 'awaiting' and payment_due_at < now());
$$;
revoke all on function public.event_tickets_taken(uuid) from public, anon;
grant execute on function public.event_tickets_taken(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_event_signup(): the one way in. Re-checks everything under a lock
-- on the event; the amount (price x tickets) comes from the event, never the
-- caller. p_take_payment: the business can take this payment online (the
-- app checks the plan and PayFast account); otherwise a priced event is
-- "pay at the event".
-- ---------------------------------------------------------------------------

create function public.create_event_signup(
  p_tenant_id uuid,
  p_event_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_contact_id uuid,
  p_quantity integer,
  p_details jsonb,
  p_idempotency_key text,
  p_widget_id uuid,
  p_take_payment boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_existing public.event_signups%rowtype;
  v_taken integer;
  v_amount integer;
  v_due timestamptz;
  v_window integer;
  v_id uuid;
begin
  select * into v_event from public.events where id = p_event_id and tenant_id = p_tenant_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_event'); end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.event_signups where event_id = p_event_id and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'repeat', true, 'signup_id', v_existing.id,
        'amount_due_cents', v_existing.amount_due_cents, 'payment_due_at', v_existing.payment_due_at,
        'payment_status', v_existing.payment_status);
    end if;
  end if;

  if v_event.status <> 'published' then return jsonb_build_object('ok', false, 'reason', 'not_open'); end if;
  if not v_event.signups_open or v_event.starts_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if p_quantity < 1 or p_quantity > v_event.max_per_signup then
    return jsonb_build_object('ok', false, 'reason', 'too_many', 'max', v_event.max_per_signup);
  end if;

  -- Holds that ran out stop counting now, under the lock.
  update public.event_signups set status = 'cancelled', payment_status = 'expired', updated_at = now()
  where event_id = p_event_id and payment_status = 'awaiting' and payment_due_at < now() and status = 'confirmed';
  update public.payments p set status = 'cancelled', updated_at = now()
  from public.event_signups s
  where p.event_signup_id = s.id and s.event_id = p_event_id and s.payment_status = 'expired' and p.status = 'created';

  v_taken := public.event_tickets_taken(p_event_id);
  if v_event.capacity is not null and v_taken + p_quantity > v_event.capacity then
    return jsonb_build_object('ok', false, 'reason', 'sold_out', 'left', greatest(v_event.capacity - v_taken, 0));
  end if;

  if p_take_payment and v_event.price_cents is not null then
    v_amount := v_event.price_cents * p_quantity;
    select coalesce(payment_window_minutes, 30) into v_window from public.agent_configs where tenant_id = p_tenant_id;
    v_due := now() + make_interval(mins => coalesce(v_window, 30));
  end if;

  insert into public.event_signups (tenant_id, event_id, contact_id, name, phone, email, quantity, details,
    payment_status, amount_due_cents, payment_due_at, idempotency_key, widget_id)
  values (p_tenant_id, p_event_id, p_contact_id, trim(p_name), p_phone, nullif(trim(coalesce(p_email, '')), ''), p_quantity,
    coalesce(p_details, '{}'::jsonb), case when v_amount is null then 'not_required' else 'awaiting' end, v_amount, v_due,
    p_idempotency_key, p_widget_id)
  returning id into v_id;

  -- Paid sign-ups alert the owner once paid (apply_payment_notification()).
  if v_amount is null then
    insert into public.notifications (tenant_id, type, title, body)
    values (p_tenant_id, 'event_signup', format('Sign-up: %s', trim(p_name)),
      format('%s ticket%s for %s', p_quantity, case when p_quantity = 1 then '' else 's' end, v_event.title));
  end if;

  return jsonb_build_object('ok', true, 'repeat', false, 'signup_id', v_id, 'amount_due_cents', v_amount,
    'payment_due_at', v_due, 'payment_status', case when v_amount is null then 'not_required' else 'awaiting' end,
    'left', case when v_event.capacity is null then null else v_event.capacity - v_taken - p_quantity end);
end;
$$;
revoke all on function public.create_event_signup(uuid, uuid, text, text, text, uuid, integer, jsonb, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.create_event_signup(uuid, uuid, text, text, text, uuid, integer, jsonb, text, uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Payments for sign-ups: a payment belongs to a booking or a sign-up.
-- ---------------------------------------------------------------------------

alter table public.payments
  add column event_signup_id uuid references public.event_signups (id) on delete set null,
  add constraint payments_one_owner check (booking_id is null or event_signup_id is null);
create index payments_event_signup_idx on public.payments (event_signup_id) where event_signup_id is not null;

-- apply_payment_notification(): as before for bookings, and the same for
-- sign-ups. Same signature, so callers don't change.
create or replace function public.apply_payment_notification(
  p_tenant_id uuid,
  p_payment_id uuid,
  p_provider text,
  p_mode text,
  p_provider_payment_id text,
  p_provider_status text,
  p_amount_gross_cents integer,
  p_fee_cents integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_signup public.event_signups%rowtype;
  v_event_title text;
  v_outcome text := 'rejected';
  v_reason text;
begin
  select * into v_payment from public.payments
  where id = p_payment_id and tenant_id = p_tenant_id
  for update;

  if not found then
    v_reason := 'unknown_payment';
  elsif v_payment.provider <> p_provider or v_payment.mode <> p_mode then
    v_reason := 'provider_or_mode_mismatch';
  elsif v_payment.status = 'paid' then
    if v_payment.provider_payment_id = p_provider_payment_id then
      v_outcome := 'duplicate';
    else
      v_reason := 'already_paid';
    end if;
  elsif p_provider_status = 'COMPLETE' then
    if p_amount_gross_cents is distinct from v_payment.amount_cents then
      v_reason := 'amount_mismatch';
      insert into public.notifications (tenant_id, type, title, body)
      values (p_tenant_id, 'payment_problem', 'A payment didn''t match',
        'A customer paid an amount that doesn''t match what they owed. Check it in PayFast before confirming.');
    else
      update public.payments set
        status = 'paid',
        provider_payment_id = p_provider_payment_id,
        fee_cents = p_fee_cents,
        net_cents = p_amount_gross_cents - coalesce(p_fee_cents, 0),
        paid_at = now(),
        updated_at = now()
      where id = v_payment.id;
      v_outcome := 'applied';

      if v_payment.event_signup_id is not null then
        select * into v_signup from public.event_signups where id = v_payment.event_signup_id for update;
        if found and v_signup.status = 'confirmed' then
          update public.event_signups set payment_status = 'paid', payment_due_at = null, updated_at = now() where id = v_signup.id;
          select title into v_event_title from public.events where id = v_signup.event_id;
          insert into public.notifications (tenant_id, type, title, body)
          values (p_tenant_id, 'event_signup', format('Paid sign-up: %s', v_signup.name),
            format('%s paid R%s for %s ticket%s to %s.', v_signup.name, to_char(v_payment.amount_cents / 100.0, 'FM999999990.00'),
              v_signup.quantity, case when v_signup.quantity = 1 then '' else 's' end, coalesce(v_event_title, 'an event')));
        else
          v_reason := 'paid_after_cancel';
          insert into public.notifications (tenant_id, type, title, body)
          values (p_tenant_id, 'payment_problem', 'Paid for a cancelled sign-up',
            'A customer paid after their event sign-up expired or was cancelled. Add them back or refund them in PayFast.');
        end if;
      else
        select * into v_booking from public.bookings where id = v_payment.booking_id for update;
        if found and v_booking.status <> 'cancelled' then
          update public.bookings set payment_status = 'paid', payment_due_at = null, updated_at = now()
          where id = v_booking.id;
          insert into public.booking_events (tenant_id, booking_id, type, actor, details)
          values (p_tenant_id, v_booking.id, 'payment_received', 'system',
            jsonb_build_object('amount_cents', v_payment.amount_cents, 'payment_id', v_payment.id));
          insert into public.notifications (tenant_id, type, title, body)
          values (p_tenant_id, 'payment_received', 'Payment received',
            format('%s paid R%s for their booking.', v_booking.name, to_char(v_payment.amount_cents / 100.0, 'FM999999990.00')));
        else
          v_reason := 'paid_after_cancel';
          insert into public.notifications (tenant_id, type, title, body)
          values (p_tenant_id, 'payment_problem', 'Paid for a cancelled booking',
            'A customer paid after their booking expired or was cancelled. Rebook them or refund them in PayFast.');
        end if;
      end if;
    end if;
  elsif p_provider_status in ('FAILED', 'CANCELLED') then
    if v_payment.status = 'created' then
      update public.payments set status = lower(p_provider_status), updated_at = now() where id = v_payment.id;
      v_outcome := 'applied';
    else
      v_outcome := 'duplicate';
    end if;
  else
    v_reason := 'ignored_status';
  end if;

  insert into public.payment_events (tenant_id, payment_id, provider, provider_payment_id, provider_status, outcome, reason)
  values (p_tenant_id, v_payment.id, p_provider, p_provider_payment_id, p_provider_status, v_outcome, v_reason);

  return jsonb_build_object('outcome', v_outcome, 'reason', v_reason);
end;
$$;

-- Releases sign-up holds that weren't paid in time (create_event_signup()
-- also does this per event); the daily cron runs it for everyone.
create function public.expire_unpaid_event_signups(p_tenant_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.event_signups set status = 'cancelled', payment_status = 'expired', updated_at = now()
    where payment_status = 'awaiting' and payment_due_at < now() and status = 'confirmed'
      and (p_tenant_id is null or tenant_id = p_tenant_id)
    returning id
  ),
  closed as (
    update public.payments p set status = 'cancelled', updated_at = now()
    from expired e where p.event_signup_id = e.id and p.status = 'created'
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;
revoke all on function public.expire_unpaid_event_signups(uuid) from public, anon, authenticated;
grant execute on function public.expire_unpaid_event_signups(uuid) to service_role;
