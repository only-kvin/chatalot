-- Staff can be told about their bookings and can sign in to see their own
-- schedule. A staff login is NOT a tenant_members row: members get the whole
-- business through RLS, staff get nothing through RLS. Their schedule page
-- reads with the service role, filtered to the staff rows linked to them.

alter table public.staff
  -- Where their booking alerts go, and the address their invite is for.
  add column email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column notify_email boolean not null default true,
  -- Set when the owner invites them; cleared when access is removed.
  add column invited_at timestamptz,
  -- Their login, linked the first time they sign in with the invited email.
  add column user_id uuid references auth.users (id) on delete set null,
  add constraint staff_user_needs_invite check (user_id is null or invited_at is not null);

-- One staff row per person per business.
create unique index staff_tenant_user_idx on public.staff (tenant_id, user_id) where user_id is not null;
create index staff_user_idx on public.staff (user_id) where user_id is not null;
-- Finding open invites by email at sign-in.
create index staff_invite_email_idx on public.staff (lower(email)) where invited_at is not null and user_id is null;
