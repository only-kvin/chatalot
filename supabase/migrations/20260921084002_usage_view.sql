-- Per-tenant daily usage, for cost tracking and the admin usage dashboard.
-- security_invoker so the view respects the querying user's own RLS, not the view creator's.
create view public.usage_daily
with (security_invoker = true)
as
select
  tenant_id,
  date_trunc('day', created_at) as day,
  count(*) as messages,
  coalesce(sum(tokens_in), 0) as tokens_in,
  coalesce(sum(tokens_out), 0) as tokens_out
from public.messages
group by tenant_id, date_trunc('day', created_at);
