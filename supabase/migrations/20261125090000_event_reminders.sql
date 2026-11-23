-- Event reminders: the daily cron emails people signed up for an event
-- starting within the next 40 hours (the rest of today and all of
-- tomorrow, from an 08:00 run), once. This records the once.
alter table public.event_signups add column reminder_sent_at timestamptz;

-- The cron's lookup: still-signed-up people not yet reminded.
create index event_signups_reminder_due_idx on public.event_signups (event_id)
  where status = 'confirmed' and reminder_sent_at is null;

-- Members already read sign-ups; reminder_sent_at is written only by the
-- cron (service role), like the other columns members can't change.
