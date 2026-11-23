-- Two things for the website factory:
--
-- 1. Platform staff: the team that builds businesses' websites. They use
--    /studio (find a business, create its widgets, copy embed codes), but
--    not /admin (plans, sign-up approvals, usage). Platform admins can do
--    everything staff can.
--
-- 2. More than one widget of a type per business: variants ("Nail bar
--    only"), and Draft widgets to try out before they go Live. Each business
--    keeps one default per type: the widget that embed codes without a
--    widget id, the hosted booking page and booking links use. Existing
--    widgets become those defaults, so nothing already embedded changes.

-- ---------------------------------------------------------------------------
-- Platform staff
-- ---------------------------------------------------------------------------

create table public.platform_staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index platform_staff_added_by_idx on public.platform_staff (added_by) where added_by is not null;

alter table public.platform_staff enable row level security;
alter table public.platform_staff force row level security;
revoke all on public.platform_staff from anon;

-- Staff can see that they're staff; admins manage the list.
create policy "staff see themselves" on public.platform_staff
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));
create policy "admins manage staff" on public.platform_staff
  for all to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

-- Staff or admin. The studio pages check this, then read with the service
-- role, so staff get no wider database access than these pages give them.
create function private.is_platform_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_staff where user_id = (select auth.uid()))
      or exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;
revoke all on function private.is_platform_staff() from public, anon;
grant execute on function private.is_platform_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- Widgets: several per type, named, Draft or Live, one default per type
-- ---------------------------------------------------------------------------

alter table public.widget_instances
  -- Shown in the dashboard and studio, e.g. "Main booking", "Test".
  add column name text not null default '' check (char_length(name) <= 60),
  -- draft: works in previews only; live: works on websites.
  add column status text not null default 'live' check (status in ('draft', 'live')),
  add column is_default boolean not null default false,
  add column created_at timestamptz not null default now(),
  add column created_by uuid references auth.users (id) on delete set null,
  -- The default is what existing embed codes show, so it's always live.
  add constraint widget_instances_default_live check (not is_default or status = 'live');

update public.widget_instances set is_default = true, name = initcap(type);

alter table public.widget_instances drop constraint widget_instances_tenant_id_type_key;
create unique index widget_instances_one_default_idx on public.widget_instances (tenant_id, type) where is_default;
create index widget_instances_tenant_type_idx on public.widget_instances (tenant_id, type);
create index widget_instances_created_by_idx on public.widget_instances (created_by) where created_by is not null;
