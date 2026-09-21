-- Row Level Security: helper functions, grants, and per-table policies.
--
-- Design: helper functions live in `private` (never exposed via PostgREST) and are
-- SECURITY INVOKER, not DEFINER. This works because each helper only ever reads rows
-- the calling user is already allowed to see under that table's own RLS policy (their
-- own tenant_members / platform_admins rows) — so no privilege escalation is needed,
-- and we avoid the sharp edges of SECURITY DEFINER (see supabase-postgres-best-practices
-- security-rls-performance.md and the Supabase security checklist).

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = (select auth.uid())
  );
$$;

create or replace function private.my_tenant_ids()
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select tenant_id from public.tenant_members
  where user_id = (select auth.uid());
$$;

-- `authenticated` needs USAGE + EXECUTE to call these from within a policy.
-- Nothing is granted to `anon` — this app never uses the anon/publishable key for
-- authenticated access; the widget and WhatsApp webhook go through the service-role
-- client instead, which bypasses RLS entirely.
grant usage on schema private to authenticated;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.my_tenant_ids() to authenticated;
revoke execute on function private.is_platform_admin() from public, anon;
revoke execute on function private.my_tenant_ids() from public, anon;

-- Table-level grants so these tables are reachable via the Data API at all — RLS then
-- decides which rows, but without this grant `authenticated` can't attempt the query.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.tenants force row level security;

create policy "members and admins can view their tenants" on public.tenants
  for select
  to authenticated
  using (
    id in (select private.my_tenant_ids())
    or (select private.is_platform_admin())
  );

create policy "only platform admins manage tenants" on public.tenants
  for all
  to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

-- ---------------------------------------------------------------------------
-- tenant_members
-- ---------------------------------------------------------------------------

alter table public.tenant_members enable row level security;
alter table public.tenant_members force row level security;

create policy "members can view their own membership" on public.tenant_members
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_platform_admin())
  );

create policy "only platform admins manage tenant membership" on public.tenant_members
  for insert
  to authenticated
  with check ((select private.is_platform_admin()));

create policy "only platform admins update tenant membership" on public.tenant_members
  for update
  to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

create policy "only platform admins delete tenant membership" on public.tenant_members
  for delete
  to authenticated
  using ((select private.is_platform_admin()));

-- ---------------------------------------------------------------------------
-- platform_admins — self-row read only; all writes are service-role/script-only
-- (see scripts/bootstrap-platform-admin.ts). No insert/update/delete policy exists
-- for `authenticated`, so RLS denies those outright regardless of the table grant.
-- ---------------------------------------------------------------------------

alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;

create policy "admins can see their own admin row" on public.platform_admins
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Standard tenant-scoped tables: one shared policy shape.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'agent_configs',
    'widget_settings',
    'knowledge_items',
    'knowledge_chunks',
    'channels',
    'contacts',
    'conversations',
    'messages',
    'leads'
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

-- ---------------------------------------------------------------------------
-- processed_events — deny-all under RLS for authenticated/anon; only the
-- service-role WhatsApp webhook route ever touches it (service_role bypasses RLS).
-- ---------------------------------------------------------------------------

alter table public.processed_events enable row level security;
alter table public.processed_events force row level security;
