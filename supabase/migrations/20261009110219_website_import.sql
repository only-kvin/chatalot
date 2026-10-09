-- Website import: a business's own website, crawled ahead of time into its
-- knowledge base (lib/website/). Imported pages are knowledge_items of type
-- 'page' and source 'website'; they're found by similarity search like any
-- other item, never added to every prompt the way 'info' items are.

alter table public.knowledge_items drop constraint knowledge_items_type_check;
alter table public.knowledge_items
  add constraint knowledge_items_type_check check (type in ('faq', 'service', 'policy', 'info', 'page'));

alter table public.knowledge_items
  add column source text not null default 'manual' check (source in ('manual', 'website')),
  add column source_url text,
  -- sha256 of the page text, so an unchanged page isn't re-embedded.
  add column content_hash text,
  -- The owner switched this page off: kept, but never searched.
  add column excluded boolean not null default false,
  -- Crawls in a row that found the page gone (404/410); deleted at 2.
  add column gone_count smallint not null default 0,
  -- Website pages are always type 'page'; typed items are always manual.
  add constraint knowledge_items_website_is_page check ((source = 'website') = (type = 'page')),
  add constraint knowledge_items_website_has_url check (source = 'manual' or source_url is not null);

-- One item per page per business.
create unique index knowledge_items_tenant_source_url_idx
  on public.knowledge_items (tenant_id, source_url) where source_url is not null;

-- Import runs. Progress is saved as pages are read, so an interrupted run
-- (time budget, deploy) resumes where it stopped.
create table public.website_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  start_url text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  pages_found int not null default 0,
  pages_done int not null default 0,
  pages_failed int not null default 0,
  -- Pages with almost no text (usually a JavaScript-only site).
  pages_empty int not null default 0,
  -- The website text cap was reached; some pages weren't added.
  capped boolean not null default false,
  error text,
  -- Crawl state for resuming: pages still to read and pages already seen.
  queue jsonb not null default '[]'::jsonb,
  seen jsonb not null default '[]'::jsonb,
  -- Bumped while a runner is working; another runner only takes over once
  -- it's stale, so two never crawl the same import at once.
  heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index website_imports_tenant_created_idx on public.website_imports (tenant_id, created_at desc);
-- Only one import in progress per business.
create unique index website_imports_one_active_idx
  on public.website_imports (tenant_id) where status in ('queued', 'running');

alter table public.website_imports enable row level security;
alter table public.website_imports force row level security;

-- Members (and platform admins) can see their imports; only the server
-- (service role) starts and updates them.
create policy "members and admins can view website imports" on public.website_imports
  for select to authenticated
  using (
    tenant_id in (select private.my_tenant_ids())
    or (select private.is_platform_admin())
  );
revoke all on public.website_imports from anon;

-- Similarity search now skips excluded pages and says where each match came
-- from. The return type changes, so the old function is replaced.
drop function public.match_chunks(uuid, extensions.vector, int);

create function public.match_chunks(
  p_tenant_id uuid,
  p_query_embedding extensions.vector(1024),
  p_k int default 5
)
returns table (
  id uuid,
  item_id uuid,
  content text,
  similarity float,
  source text,
  source_url text,
  title text
)
language sql
stable
set search_path = public, extensions
as $$
  select
    c.id,
    c.item_id,
    c.content,
    1 - (c.embedding <=> p_query_embedding) as similarity,
    i.source,
    i.source_url,
    i.title
  from public.knowledge_chunks c
  join public.knowledge_items i on i.id = c.item_id and i.tenant_id = c.tenant_id
  where c.tenant_id = p_tenant_id
    and not i.excluded
  order by c.embedding <=> p_query_embedding
  limit p_k;
$$;
