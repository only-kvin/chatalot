-- Knowledge base: human-edited items, and their embedded chunks for retrieval (Phase 1+)

create table public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  type text not null check (type in ('faq', 'service', 'policy', 'info')),
  title text not null,
  content text not null,
  updated_at timestamptz not null default now()
);
create index knowledge_items_tenant_id_idx on public.knowledge_items (tenant_id);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  item_id uuid not null references public.knowledge_items (id) on delete cascade,
  content text not null,
  embedding extensions.vector(1024)
);
create index knowledge_chunks_tenant_id_idx on public.knowledge_chunks (tenant_id);
create index knowledge_chunks_item_id_idx on public.knowledge_chunks (item_id);

-- HNSW: no training-data requirement, good default recall on small/empty tables (unlike IVFFlat)
create index knowledge_chunks_embedding_hnsw_idx
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- Similarity search scoped to one tenant. Used by the agent engine from Phase 1 onward.
create or replace function public.match_chunks(
  p_tenant_id uuid,
  p_query_embedding extensions.vector(1024),
  p_k int default 5
)
returns table (
  id uuid,
  item_id uuid,
  content text,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    c.id,
    c.item_id,
    c.content,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.knowledge_chunks c
  where c.tenant_id = p_tenant_id
  order by c.embedding <=> p_query_embedding
  limit p_k;
$$;
