-- Core multi-tenancy tables: tenants, tenant_members, platform_admins

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan text not null default 'trial',
  status text not null default 'active' check (status in ('active', 'suspended')),
  public_widget_key uuid not null default gen_random_uuid() unique,
  allowed_domains text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.tenant_members (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index tenant_members_user_id_idx on public.tenant_members (user_id);

-- Platform owner (you) — not tenant-scoped. Bootstrapped by a script, never via the app UI.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
