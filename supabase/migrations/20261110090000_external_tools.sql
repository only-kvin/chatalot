-- External tools: lets another app give a business's receptionist an extra
-- ability over HTTPS, e.g. an auto spares app answering "do you have this part
-- in stock?" from its own inventory. The AI is offered the tool like a built-in
-- one; when it calls it, Bookfront POSTs the input to endpoint_url, signed with
-- the tool's secret, and feeds the text result back to the model.
--
-- Rows are written by the platform (scripts/register-external-tool.ts), never
-- by a business: a tool definition decides where a customer's words are sent.

create table public.external_tools (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- What the model calls. Must not clash with a built-in tool (checked in code).
  name text not null check (name ~ '^[a-z][a-z0-9_]{2,40}$'),
  description text not null check (char_length(description) between 1 and 800),
  -- JSON Schema for the input: { "type": "object", "properties": {...}, "required": [...] }.
  parameters jsonb not null,
  endpoint_url text not null,
  -- HMAC signing secret, encrypted like WhatsApp tokens (lib/security/crypto.ts).
  secret_encrypted text not null,
  -- Added to this business's prompt: when to use the tool and how to word results.
  prompt_note text not null default '' check (char_length(prompt_note) <= 2000),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

-- Service role only (the engine and the registration script). Platform admins
-- may look; nobody signed in can write, and members can't read the endpoint.
alter table public.external_tools enable row level security;

create policy "platform admins can view external tools" on public.external_tools
  for select to authenticated
  using ((select private.is_platform_admin()));

revoke all on public.external_tools from anon;
