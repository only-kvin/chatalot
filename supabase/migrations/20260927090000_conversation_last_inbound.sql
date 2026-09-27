-- WhatsApp's 24-hour customer service window: free-form messages may only be
-- sent within 24h of the customer's last inbound message; outside it, only
-- approved templates. last_message_at can't serve this once outbound sends
-- (e.g. human replies from the dashboard) start touching it, so the inbound
-- timestamp gets its own column. Null = the customer has never messaged in.
alter table public.conversations add column last_inbound_at timestamptz;

-- Until now last_message_at was only ever set on inbound WhatsApp messages,
-- so it's an accurate backfill for existing WhatsApp conversations.
update public.conversations
set last_inbound_at = last_message_at
where channel = 'whatsapp';
