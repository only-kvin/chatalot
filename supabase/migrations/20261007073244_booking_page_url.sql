-- Widget suite, Phase F: where the AI sends customers who'd rather book by
-- clicking. Empty = ChatAlot's hosted page (/book/<slug>); set it when the
-- business has the appointment widget on its own website.
alter table public.agent_configs
  add column booking_page_url text check (booking_page_url ~ '^https://');
