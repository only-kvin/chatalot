-- Booking lifecycle: cancel, reschedule and attended/no-show, with a history
-- of every change so the owner can see who did what and when.

-- 'completed' is shown as "Attended"; 'no_show' is new.
alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('confirmed', 'cancelled', 'completed', 'no_show'));

alter table public.bookings
  -- How the booking was made.
  add column source text not null default 'web' check (source in ('web', 'whatsapp', 'team')),
  add column updated_at timestamptz not null default now();

update public.bookings b set source = c.channel
from public.conversations c
where c.id = b.conversation_id and c.channel in ('web', 'whatsapp');

-- Minimum notice, in minutes, for customers to cancel or reschedule
-- themselves; inside it the AI hands them to the team.
alter table public.agent_configs
  add column booking_change_cutoff_minutes integer not null default 120
    check (booking_change_cutoff_minutes between 0 and 10080);

-- Every change to a booking. Written by the backend (AI actions, reminders)
-- and by dashboard users (team actions); never edited afterwards.
create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  type text not null check (type in ('created', 'rescheduled', 'cancelled', 'attended', 'no_show', 'reopened', 'reminder_sent')),
  -- ai = done by the AI at the customer's request; team = a dashboard user.
  actor text not null check (actor in ('ai', 'team', 'system')),
  channel text check (channel in ('web', 'whatsapp', 'dashboard')),
  -- e.g. {"from": "...", "to": "..."} for reschedules, {"reason": "..."}.
  details jsonb not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index booking_events_booking_idx on public.booking_events (booking_id, created_at);
create index booking_events_tenant_idx on public.booking_events (tenant_id, created_at desc);
create index booking_events_created_by_idx on public.booking_events (created_by) where created_by is not null;

alter table public.booking_events enable row level security;
alter table public.booking_events force row level security;

revoke all on public.booking_events from anon;
revoke update, delete on public.booking_events from authenticated;
grant select, insert on public.booking_events to authenticated;

create policy "members read their tenant's booking events" on public.booking_events
  for select
  to authenticated
  using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()));

-- Team actions from the dashboard, attributed to the member making them.
create policy "members log team booking events" on public.booking_events
  for insert
  to authenticated
  with check (
    (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()))
    and actor = 'team'
    and created_by = (select auth.uid())
  );

-- History for bookings made before this log existed.
insert into public.booking_events (tenant_id, booking_id, type, actor, channel, created_at)
select tenant_id, id, 'created', 'ai', source, created_at from public.bookings;

-- Alerts when a customer cancels or moves a booking.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('human_requested', 'new_lead', 'new_booking', 'booking_cancelled', 'booking_rescheduled'));
