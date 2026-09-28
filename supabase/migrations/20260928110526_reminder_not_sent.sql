-- A reminder that couldn't go out (customer opted out, no approved template
-- and outside WhatsApp's 24h window, send failed) is recorded in the booking
-- history and raised on the owner's bell, so someone can call the customer
-- instead of it failing silently in server logs.
alter table public.booking_events drop constraint booking_events_type_check;
alter table public.booking_events add constraint booking_events_type_check
  check (type in ('created', 'rescheduled', 'cancelled', 'attended', 'no_show', 'reopened', 'reminder_sent', 'reminder_not_sent'));

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('human_requested', 'new_lead', 'new_booking', 'booking_cancelled', 'booking_rescheduled', 'reminder_not_sent'));
