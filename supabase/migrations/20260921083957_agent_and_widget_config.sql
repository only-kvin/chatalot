-- Per-tenant agent behaviour and widget appearance

create table public.agent_configs (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  business_name text not null default '',
  tone text not null default 'friendly and professional',
  greeting text not null default 'Hi! How can I help you today?',
  system_prompt_extra text not null default '',
  lead_fields jsonb not null default '["name", "phone"]'::jsonb,
  handoff_contact text not null default '',
  model text not null default 'claude-haiku-4-5-20251001',
  daily_message_cap integer not null default 200,
  updated_at timestamptz not null default now()
);

create table public.widget_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  primary_color text not null default '#4f46e5',
  position text not null default 'bottom-right' check (position in ('bottom-right', 'bottom-left')),
  avatar_url text,
  launcher_text text not null default 'Chat with us',
  teaser_text text,
  quick_replies jsonb not null default '[]'::jsonb,
  whatsapp_link text,
  updated_at timestamptz not null default now()
);
