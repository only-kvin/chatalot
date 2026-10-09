-- Self-serve sign-up. Someone fills in /signup, confirms their email by
-- magic link, and gets a trial business they can set up straight away. It
-- stays "pending" (invisible to the public: every public endpoint only
-- serves "active" businesses) until a platform admin approves it.

-- New statuses: pending (waiting for approval) and declined.
alter table public.tenants drop constraint tenants_status_check;
alter table public.tenants
  add constraint tenants_status_check check (status in ('active', 'suspended', 'pending', 'declined'));

-- The business type chosen at sign-up (a group slug from
-- lib/marketing/business-types.ts, or 'other'), and when it was approved.
alter table public.tenants add column business_type text;
alter table public.tenants add column approved_at timestamptz;

-- Sign-up requests, before and after the email is confirmed. One per email,
-- ever: that's the "one trial per email" rule. Only the server (service
-- role) reads or writes these.
create table public.signups (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  business_name text not null check (length(business_name) between 1 and 120),
  business_type text not null,
  created_at timestamptz not null default now(),
  -- Set once the email is confirmed and the business exists.
  tenant_id uuid references public.tenants (id) on delete set null,
  completed_at timestamptz
);
create unique index signups_email_idx on public.signups (email);
create index signups_tenant_id_idx on public.signups (tenant_id);

alter table public.signups enable row level security;
alter table public.signups force row level security;
-- No policies: anon and authenticated users can't touch it at all.
revoke all on public.signups from anon, authenticated;

-- Turns a confirmed sign-up into a pending trial business owned by the user.
-- All or nothing, and safe to call twice (a refreshed or reused link): the
-- sign-up row is locked, and if it already has a business that one is
-- returned. Refuses users who already belong to a business, and sign-ups
-- for a different email. Returns the tenant id and whether it was created now.
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

  insert into public.tenants (name, slug, status, plan, business_type, feature_overrides)
  values (
    v_signup.business_name,
    v_slug,
    'pending',
    'trial',
    v_signup.business_type,
    -- Trades take callouts, not appointments: bookings start hidden.
    case when v_signup.business_type = 'trades' then '{"bookings": "off"}'::jsonb else '{}'::jsonb end
  )
  returning id into v_tenant_id;

  insert into public.agent_configs (tenant_id, business_name) values (v_tenant_id, v_signup.business_name);
  insert into public.widget_settings (tenant_id) values (v_tenant_id);
  insert into public.tenant_members (tenant_id, user_id, role) values (v_tenant_id, p_user_id, 'owner');

  update public.signups set tenant_id = v_tenant_id, completed_at = now() where id = v_signup.id;

  return query select v_tenant_id, true;
end;
$$;

revoke all on function public.complete_signup(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_signup(uuid, text) to service_role;
