-- Review requests: the morning after a booking is marked Attended, the
-- customer is asked on WhatsApp to rate their visit 1-5, with the business's
-- Google review link included for everyone (Google forbids only asking happy
-- customers). The rating is stored on the booking; low scores alert the owner.

-- The business's Google review link. Review requests are only sent once it's
-- set, so it doubles as the tenant's on switch.
alter table public.agent_configs
  add column google_review_url text check (google_review_url ~ '^https://');

alter table public.bookings
  -- When the request was attempted, and whether it went out. Attempted once
  -- per booking, never retried.
  add column review_requested_at timestamptz,
  add column review_request_status text check (review_request_status in ('sent', 'not_sent')),
  add column review_rating smallint check (review_rating between 1 and 5),
  add column review_rated_at timestamptz;

-- Finding the open request a customer's "5" answers, on every inbound
-- WhatsApp message.
create index bookings_open_review_idx on public.bookings (tenant_id, contact_id, review_requested_at desc)
  where review_request_status = 'sent' and review_rating is null;

alter table public.booking_events drop constraint booking_events_type_check;
alter table public.booking_events add constraint booking_events_type_check
  check (type in (
    'created', 'rescheduled', 'cancelled', 'attended', 'no_show', 'reopened',
    'reminder_sent', 'reminder_not_sent',
    'review_requested', 'review_not_sent', 'review_rated'
  ));

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'human_requested', 'new_lead', 'new_booking', 'booking_cancelled', 'booking_rescheduled',
    'reminder_not_sent', 'low_rating'
  ));
