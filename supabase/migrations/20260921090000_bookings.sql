-- Phase 4: services, availability rules, and bookings.
--
-- Capacity model: a single shared calendar per tenant — one booking at a time
-- across the whole business regardless of service. There's no staff/resource
-- concept in the spec's data model, so this matches a solo/small operator.
-- Timezone: every tenant is a South African business, so tenant-local time is
-- hardcoded to Africa/Johannesburg (UTC+2, no DST) in application code rather
-- than stored per-tenant.

create extension if not exists btree_gist with schema extensions;

create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  description text not null default '',
  duration_minutes integer not null check (duration_minutes > 0),
  price_cents integer,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index services_tenant_id_idx on public.services (tenant_id);

-- Recurring weekly open windows. Multiple rows per weekday are allowed (split
-- shifts, e.g. 9-13 and 14-18).
create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  check (start_time < end_time)
);
create index availability_rules_tenant_id_idx on public.availability_rules (tenant_id);

-- One-off overrides: a closed date (public holiday) or custom hours for a
-- specific date, taking precedence over availability_rules for that date.
create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  date date not null,
  is_closed boolean not null default true,
  start_time time,
  end_time time,
  unique (tenant_id, date)
);
create index availability_exceptions_tenant_id_idx on public.availability_exceptions (tenant_id);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete restrict,
  contact_id uuid references public.contacts (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  name text not null,
  phone text not null,
  email text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed')),
  notes text not null default '',
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at),
  -- DB-enforced double-booking prevention (race-safe under concurrent inserts,
  -- not just an application-level check-then-insert).
  exclude using gist (
    tenant_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled')
);
create index bookings_tenant_id_starts_at_idx on public.bookings (tenant_id, starts_at);

-- ---------------------------------------------------------------------------
-- RLS — same "tenant isolation" shape as the existing standard-tables loop in
-- 20260921084004_rls_policies.sql (not edited here since it's already applied).
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'services',
    'availability_rules',
    'availability_exceptions',
    'bookings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
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
