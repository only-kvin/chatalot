-- The business's own address, shown to customers on bookings at the
-- business (confirmations, the booking widgets and page). Empty = not shown.
alter table public.agent_configs
  add column business_address text not null default '' check (length(business_address) <= 300);
