-- Staff emails are stored lowercased, so invites are matched with a plain
-- equality (an ilike would treat "_" in an address as a wildcard).
alter table public.staff add constraint staff_email_lowercase check (email = lower(email));

drop index public.staff_invite_email_idx;
create index staff_invite_email_idx on public.staff (email) where invited_at is not null and user_id is null;
