-- Owner-facing switches on the dashboard Overview ("AI receptionist" panel).
-- All default on, which is how ChatAlot behaved before they existed.
alter table public.agent_configs
  -- Off: website visitors get a fixed reply with the business's contact
  -- details, and their messages are kept for the owner.
  add column web_ai_enabled boolean not null default true,
  -- Off: WhatsApp messages are saved and the owner replies from the dashboard.
  add column whatsapp_ai_enabled boolean not null default true,
  -- Off: new leads still appear in the bell and on the Leads page, just no email.
  add column lead_email_enabled boolean not null default true;
