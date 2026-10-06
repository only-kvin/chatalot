-- Owner daily summary: a morning email with today's bookings, what needs the
-- owner's attention, and yesterday's activity. Sent by the daily cron.

alter table public.agent_configs
  -- On for every business unless the owner turns it off in Settings.
  add column daily_summary_enabled boolean not null default true,
  -- The SA date of the last summary sent. Claimed before sending, so a cron
  -- that fires twice can't email the owner twice.
  add column daily_summary_sent_on date;
