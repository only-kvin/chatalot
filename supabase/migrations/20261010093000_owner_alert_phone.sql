-- Where urgent call-outs reach the owner on WhatsApp (their own mobile,
-- not the business's WhatsApp number). Empty = no WhatsApp alert; the bell
-- and email still go out.
alter table public.agent_configs
  add column owner_alert_phone text not null default '' check (length(owner_alert_phone) <= 30);
