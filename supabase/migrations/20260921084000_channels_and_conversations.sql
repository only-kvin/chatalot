-- Channels, contacts, conversations, messages, leads, and webhook dedup

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  type text not null check (type in ('web', 'whatsapp')),
  wa_phone_number_id text unique,
  wa_access_token_encrypted text,
  status text not null default 'active' check (status in ('active', 'disabled'))
);
create index channels_tenant_id_idx on public.channels (tenant_id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text,
  phone text,
  email text,
  consent_at timestamptz
);
create index contacts_tenant_id_idx on public.contacts (tenant_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  channel text not null check (channel in ('web', 'whatsapp')),
  external_id text not null,
  contact_id uuid references public.contacts (id) on delete set null,
  status text not null default 'ai' check (status in ('ai', 'human', 'closed')),
  last_message_at timestamptz not null default now(),
  unique (tenant_id, channel, external_id)
);
create index conversations_tenant_id_idx on public.conversations (tenant_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  created_at timestamptz not null default now()
);
create index messages_tenant_id_idx on public.messages (tenant_id);
create index messages_conversation_id_idx on public.messages (conversation_id);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  name text,
  phone text,
  email text,
  interest text,
  summary text,
  status text not null default 'new' check (status in ('new', 'contacted', 'booked', 'won', 'lost')),
  source text not null default 'web',
  created_at timestamptz not null default now()
);
create index leads_tenant_id_idx on public.leads (tenant_id);

-- Webhook idempotency. Deliberately has no tenant_id: Meta message IDs are globally
-- unique, and only the service-role WhatsApp webhook route ever reads or writes this
-- table, so per-tenant scoping would add nothing.
create table public.processed_events (
  provider_message_id text primary key,
  created_at timestamptz not null default now()
);
