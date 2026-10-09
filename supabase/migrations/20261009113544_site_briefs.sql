-- Site briefs: what ChatAlot knows about a business, turned into a stored,
-- versioned website brief and Lovable prompt (lib/site-brief/). Plus the
-- business-level consent that controls whether its website's content and
-- images may be used at all.

-- Business consent (not the business's customers' consent, which is in
-- `consents`). Append-only: the latest row per kind is the current answer.
create table public.tenant_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('website_content', 'website_images')),
  granted boolean not null,
  -- Which wording they agreed to (lib/consent/business-consent.ts).
  text_version text not null,
  -- The owner who answered; null when a platform admin recorded it.
  granted_by uuid references auth.users (id) on delete set null,
  source text not null check (source in ('signup', 'settings', 'admin')),
  note text,
  created_at timestamptz not null default now(),
  -- Consent recorded by an admin (given by email or phone) needs a note.
  check (source <> 'admin' or length(coalesce(note, '')) > 0)
);
create index tenant_consents_current_idx on public.tenant_consents (tenant_id, kind, created_at desc);

alter table public.tenant_consents enable row level security;
alter table public.tenant_consents force row level security;
create policy "members and admins can view business consents" on public.tenant_consents
  for select to authenticated
  using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()));
-- Written only by the server (service role) after checking who's asking.
revoke all on public.tenant_consents from anon;

-- The two answers given at sign-up, kept until the business exists.
alter table public.signups
  add column consent_website_content boolean not null default false,
  add column consent_website_images boolean not null default false;

create table public.site_briefs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  version int not null,
  status text not null default 'draft' check (status in ('draft', 'ready', 'in_build', 'live', 'withdrawn')),
  profile jsonb not null,
  profile_schema_version int not null,
  prompt_markdown text not null,
  image_policy text not null check (image_policy in ('own', 'ai_generated')),
  -- When the business data was read, and a fingerprint of it (services,
  -- prices, hours, staff) to tell when the brief has gone stale.
  data_snapshot_at timestamptz not null,
  data_fingerprint text not null,
  missing jsonb not null default '[]'::jsonb,
  conflicts jsonb not null default '[]'::jsonb,
  lovable_project_url text,
  live_domain text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, version)
);
create index site_briefs_status_idx on public.site_briefs (status, created_at desc);

alter table public.site_briefs enable row level security;
alter table public.site_briefs force row level security;
-- Owners read their own; platform admins read all. Only admins change them,
-- through the server.
create policy "members and admins can view site briefs" on public.site_briefs
  for select to authenticated
  using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()));
revoke all on public.site_briefs from anon;

-- "I'd like a new website": a request the platform admin follows up by hand.
create table public.website_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create unique index website_requests_open_idx on public.website_requests (tenant_id) where handled_at is null;

alter table public.website_requests enable row level security;
alter table public.website_requests force row level security;
create policy "members and admins can view website requests" on public.website_requests
  for select to authenticated
  using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()));
revoke all on public.website_requests from anon;
