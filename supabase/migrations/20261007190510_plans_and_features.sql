-- Plans and per-tenant feature switches. Which features each plan includes
-- lives in code (lib/plans.ts); the database only stores the tenant's plan
-- and the platform admin's overrides. Both are on `tenants`, which only
-- platform admins can update (see rls_policies), so owners can't change them.

alter table public.tenants
  add constraint tenants_plan_check check (plan in ('trial', 'starter', 'growth', 'pro'));

-- { "<feature>": "on" | "off" }. A feature not listed follows the plan.
-- "off" hides the feature from the owner entirely (it doesn't fit the
-- business); a feature that's merely not in the plan shows as locked.
alter table public.tenants
  add column feature_overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(feature_overrides) = 'object');

-- An owner's "Request upgrade" click on a locked feature. Stays pending until
-- the platform admin marks it handled (usually after changing the plan).
create table public.upgrade_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  feature text not null,
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

-- One open request per tenant and feature; repeat clicks are no-ops.
create unique index upgrade_requests_open_idx
  on public.upgrade_requests (tenant_id, feature) where handled_at is null;

alter table public.upgrade_requests enable row level security;
alter table public.upgrade_requests force row level security;

create policy "members and admins can view upgrade requests" on public.upgrade_requests
  for select to authenticated
  using (
    tenant_id in (select private.my_tenant_ids())
    or (select private.is_platform_admin())
  );

create policy "members can request upgrades for their tenant" on public.upgrade_requests
  for insert to authenticated
  with check (
    tenant_id in (select private.my_tenant_ids())
    and requested_by = (select auth.uid())
    and handled_at is null
  );

create policy "only platform admins handle upgrade requests" on public.upgrade_requests
  for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));
