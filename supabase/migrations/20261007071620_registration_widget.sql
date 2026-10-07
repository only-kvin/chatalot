-- Widget suite, Phase E2: customers who sign up through the registration
-- widget. When they first registered; their consents are in `consents`.
alter table public.contacts add column registered_at timestamptz;
