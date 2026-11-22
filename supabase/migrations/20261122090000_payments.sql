-- Payments: a business takes a deposit or full payment for a booking through
-- ITS OWN payment gateway account ("bring your own gateway"). Money goes from
-- the customer straight to the business; Bookfront never holds it. Bookfront
-- builds the checkout (amount always read from the database, never from the
-- customer), and marks a booking paid only from the gateway's signed server
-- notification (PayFast "ITN"), never from the page the customer returns to.
--
-- v1 provider: PayFast. `provider` columns leave room for Yoco/Ozow/Paystack.
--
-- Flow:
--   1. Customer books a service with payment_mode deposit|full.
--   2. The booking is made as usual (it holds the slot) with
--      payment_status = 'awaiting' and payment_due_at = now + payment window.
--   3. The app creates a `payments` row; its id is PayFast's m_payment_id.
--   4. PayFast POSTs the ITN to /api/payments/payfast/notify/<tenant_id>; the
--      route verifies it (signature with the tenant's passphrase, PayFast
--      source IP, server-to-server validate) and calls
--      apply_payment_notification(), which re-checks the amount under a lock.
--   5. Unpaid bookings past payment_due_at are cancelled by
--      expire_unpaid_bookings(), which frees the slot.

-- ---------------------------------------------------------------------------
-- A business's gateway account.
-- ---------------------------------------------------------------------------

create table public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null default 'payfast' check (provider in ('payfast')),
  -- sandbox = PayFast's test site (sandbox.payfast.co.za); no real money.
  mode text not null default 'sandbox' check (mode in ('sandbox', 'live')),
  merchant_id text not null check (merchant_id ~ '^[0-9]{5,12}$'),
  -- Encrypted with lib/security/crypto.ts (AES-256-GCM, ENCRYPTION_KEY), like
  -- WhatsApp tokens. Decrypted only on the server, never sent to a browser.
  merchant_key_encrypted text not null,
  -- Required: PayFast signatures without a passphrase are easier to forge.
  passphrase_encrypted text not null,
  -- unverified = saved but not tested; active = test passed, checkout on;
  -- disabled = the owner (or we) switched it off.
  status text not null default 'unverified' check (status in ('unverified', 'active', 'disabled')),
  verified_at timestamptz,
  last_error text check (char_length(last_error) <= 500),
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);
create index payment_accounts_updated_by_idx on public.payment_accounts (updated_by) where updated_by is not null;

-- Members can see the account's state but never the encrypted columns.
-- Writes go through a server action that checks the member is an owner and
-- encrypts the credentials, using the service role.
alter table public.payment_accounts enable row level security;
alter table public.payment_accounts force row level security;
revoke all on public.payment_accounts from anon, authenticated;
grant select (id, tenant_id, provider, mode, merchant_id, status, verified_at, last_error, updated_at)
  on public.payment_accounts to authenticated;

create policy "members view their payment account" on public.payment_accounts
  for select to authenticated
  using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()));

-- ---------------------------------------------------------------------------
-- What a service asks for up front.
-- ---------------------------------------------------------------------------

alter table public.services
  -- none = pay at the business as today; deposit = deposit_cents online;
  -- full = the whole fixed price online.
  add column payment_mode text not null default 'none' check (payment_mode in ('none', 'deposit', 'full')),
  add column deposit_cents integer check (deposit_cents > 0),
  add constraint services_payment_check check (
    payment_mode = 'none'
    or (payment_mode = 'deposit' and deposit_cents is not null)
    -- "from R300" or "on inspection" has no exact amount to charge.
    or (payment_mode = 'full' and price_type = 'fixed' and coalesce(price_cents, 0) > 0)
  ),
  add constraint services_deposit_not_above_price check (
    deposit_cents is null or price_cents is null or price_type <> 'fixed' or deposit_cents <= price_cents
  );

-- How long an unpaid booking holds its slot.
alter table public.agent_configs
  add column payment_window_minutes integer not null default 30
    check (payment_window_minutes between 10 and 1440);

-- ---------------------------------------------------------------------------
-- A booking's payment state (separate from status: 'pending' already means
-- "waiting for the owner to approve").
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column payment_status text not null default 'not_required'
    check (payment_status in ('not_required', 'awaiting', 'paid', 'expired', 'refunded')),
  -- The amount as agreed when booked, so later price changes don't rewrite it.
  add column amount_due_cents integer check (amount_due_cents > 0),
  add column payment_due_at timestamptz,
  add constraint bookings_payment_check check (
    payment_status <> 'awaiting' or (amount_due_cents is not null and payment_due_at is not null)
  );
create index bookings_payment_due_idx on public.bookings (payment_due_at) where payment_status = 'awaiting';

-- ---------------------------------------------------------------------------
-- Payment attempts. id is sent to PayFast as m_payment_id.
-- ---------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- Money records outlive a deleted booking.
  booking_id uuid references public.bookings (id) on delete set null,
  payment_account_id uuid references public.payment_accounts (id) on delete set null,
  -- Copied when created: a sandbox notification can never pay a live payment.
  provider text not null check (provider in ('payfast')),
  mode text not null check (mode in ('sandbox', 'live')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'ZAR' check (currency = 'ZAR'),
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'cancelled', 'refunded')),
  -- PayFast's pf_payment_id, set from the notification.
  provider_payment_id text,
  fee_cents integer,
  net_cents integer,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index payments_tenant_created_idx on public.payments (tenant_id, created_at desc);
create index payments_booking_idx on public.payments (booking_id) where booking_id is not null;
create index payments_account_idx on public.payments (payment_account_id) where payment_account_id is not null;

-- Every gateway notification we received, valid or not. No raw payload: it
-- carries the customer's name and email (POPIA) and we don't need it.
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete set null,
  provider text not null,
  provider_payment_id text,
  provider_status text,
  -- applied = changed a payment; duplicate = seen already; rejected = refused.
  outcome text not null check (outcome in ('applied', 'duplicate', 'rejected')),
  reason text check (char_length(reason) <= 200),
  received_at timestamptz not null default now()
);
create index payment_events_tenant_idx on public.payment_events (tenant_id, received_at desc);
create index payment_events_payment_idx on public.payment_events (payment_id) where payment_id is not null;

-- Read-only for members; only the service role (checkout + notify routes)
-- and the functions below write.
do $$
declare
  t text;
begin
  foreach t in array array['payments', 'payment_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy "members read their tenant''s rows" on public.%I
         for select
         to authenticated
         using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()))',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- New history and alert types.
-- ---------------------------------------------------------------------------

alter table public.booking_events drop constraint booking_events_type_check;
alter table public.booking_events add constraint booking_events_type_check
  check (type in (
    'created', 'rescheduled', 'cancelled', 'attended', 'no_show', 'reopened',
    'approved', 'declined',
    'reminder_sent', 'reminder_not_sent',
    'review_requested', 'review_not_sent', 'review_rated',
    'payment_received', 'payment_expired', 'payment_refunded'
  ));

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'human_requested', 'new_lead', 'new_booking', 'booking_cancelled', 'booking_rescheduled',
    'reminder_not_sent', 'low_rating', 'approval_needed', 'contact_message', 'urgent',
    'payment_received', 'payment_problem'
  ));

-- ---------------------------------------------------------------------------
-- apply_payment_notification(): called by the notify route AFTER it has
-- verified the notification's signature, source and server-side validation.
-- Re-checks everything that matters under a row lock, so a replayed or
-- doubled notification can't pay twice or pay the wrong amount.
-- ---------------------------------------------------------------------------

create function public.apply_payment_notification(
  p_tenant_id uuid,
  p_payment_id uuid,
  p_provider text,
  p_mode text,
  p_provider_payment_id text,
  -- PayFast payment_status: COMPLETE | FAILED | CANCELLED (others ignored).
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
        'A customer paid an amount that doesn''t match their booking. Check it in PayFast before confirming.');
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
        -- Paid after the hold expired (or the booking was cancelled): the
        -- money is in the business's account but there's no booking. The
        -- owner must rebook or refund in PayFast.
        v_reason := 'paid_after_cancel';
        insert into public.notifications (tenant_id, type, title, body)
        values (p_tenant_id, 'payment_problem', 'Paid for a cancelled booking',
          'A customer paid after their booking expired or was cancelled. Rebook them or refund them in PayFast.');
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
  values (p_tenant_id, case when v_payment.id is null then null else v_payment.id end,
    p_provider, p_provider_payment_id, p_provider_status, v_outcome, v_reason);

  return jsonb_build_object('outcome', v_outcome, 'reason', v_reason);
end;
$$;

revoke all on function public.apply_payment_notification(uuid, uuid, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.apply_payment_notification(uuid, uuid, text, text, text, text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- expire_unpaid_bookings(): frees slots held by bookings that weren't paid
-- in time. Called before checking availability for a tenant (so a stale
-- hold never blocks a customer) and for everyone by the daily cron.
-- ---------------------------------------------------------------------------

create function public.expire_unpaid_bookings(p_tenant_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.bookings set
      status = 'cancelled',
      payment_status = 'expired',
      updated_at = now()
    where payment_status = 'awaiting'
      and payment_due_at < now()
      and status in ('pending', 'confirmed')
      and (p_tenant_id is null or tenant_id = p_tenant_id)
    returning id, tenant_id
  ),
  logged as (
    insert into public.booking_events (tenant_id, booking_id, type, actor, details)
    select tenant_id, id, 'payment_expired', 'system', '{"reason": "not paid in time"}'::jsonb from expired
  ),
  closed as (
    update public.payments p set status = 'cancelled', updated_at = now()
    from expired e
    where p.booking_id = e.id and p.status = 'created'
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

revoke all on function public.expire_unpaid_bookings(uuid) from public, anon, authenticated;
grant execute on function public.expire_unpaid_bookings(uuid) to service_role;
