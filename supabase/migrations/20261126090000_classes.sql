-- Classes: a weekly timetable ("Beginners Yoga, Mon & Wed 18:00, 60 min,
-- 12 spots, with Sarah") that keeps about eight weeks of sessions created
-- ahead. Each session is an event (kind = 'class'), so booking a spot,
-- paid drop-ins, reminders, cancellation emails and the sign-up list all
-- work as they do for events. One spot per booking (max_per_signup = 1).
-- A single session can be cancelled or edited on its own.

create table public.class_series (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 5000),
  -- The instructor: one of the business's staff.
  staff_id uuid references public.staff (id) on delete set null,
  -- 0 = Sunday ... 6 = Saturday.
  weekdays smallint[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  start_time time not null,
  duration_minutes integer not null check (duration_minutes between 5 and 600),
  capacity integer check (capacity between 1 and 10000),
  -- Drop-in price per class; null = free.
  price_cents integer check (price_cents between 100 and 100000000),
  location text not null default '' check (char_length(location) <= 300),
  starts_on date not null,
  ends_on date,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index class_series_tenant_idx on public.class_series (tenant_id);
create index class_series_staff_idx on public.class_series (staff_id) where staff_id is not null;
create index class_series_created_by_idx on public.class_series (created_by) where created_by is not null;

alter table public.class_series enable row level security;
alter table public.class_series force row level security;
revoke all on public.class_series from anon;
create policy "tenant isolation" on public.class_series
  for all to authenticated
  using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()))
  with check (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()));

alter table public.events
  add column kind text not null default 'event' check (kind in ('event', 'class')),
  add column series_id uuid references public.class_series (id) on delete set null,
  add column staff_id uuid references public.staff (id) on delete set null;
-- One session per series per start time: regenerating never duplicates, and
-- a cancelled session is never recreated.
create unique index events_series_start_idx on public.events (series_id, starts_at) where series_id is not null;
create index events_tenant_kind_starts_idx on public.events (tenant_id, kind, starts_at);
create index events_staff_idx on public.events (staff_id) where staff_id is not null;

-- The Find a Class widget.
alter table public.widget_instances drop constraint widget_instances_type_check;
alter table public.widget_instances add constraint widget_instances_type_check
  check (type in ('schedule', 'appointment', 'contact', 'registration', 'events', 'classes'));

-- ---------------------------------------------------------------------------
-- sync_class_series(): brings a series' future sessions in line with it.
--   1. Future sessions (not cancelled) take the series' details.
--   2. Future sessions nobody has booked that no longer fit the timetable
--      (day, time, date range, or the series switched off) are removed;
--      booked ones stay for the business to deal with, and cancelled ones
--      stay as the record that the class is off that day.
--   3. Missing sessions are created up to p_weeks ahead, except on a day
--      with a cancelled session (cancelled stays cancelled, even after the
--      class moves to a different time).
-- Times are SA time (no daylight saving).
-- ---------------------------------------------------------------------------

create function public.sync_class_series(p_series_id uuid, p_weeks integer default 8)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.class_series%rowtype;
  v_from date := (now() at time zone 'Africa/Johannesburg')::date;
  v_until date;
  v_day date;
  v_start timestamptz;
  v_created integer := 0;
begin
  select * into s from public.class_series where id = p_series_id for update;
  if not found then return 0; end if;

  update public.events set
    title = s.title, description = s.description, location = s.location, staff_id = s.staff_id,
    capacity = s.capacity, price_cents = s.price_cents, max_per_signup = 1,
    ends_at = starts_at + make_interval(mins => s.duration_minutes), updated_at = now()
  where series_id = s.id and starts_at > now() and status <> 'cancelled';

  delete from public.events e
  where e.series_id = s.id and e.starts_at > now() and e.status <> 'cancelled'
    and not exists (select 1 from public.event_signups x where x.event_id = e.id)
    and (
      not s.active
      or extract(dow from e.starts_at at time zone 'Africa/Johannesburg')::smallint <> all (s.weekdays)
      or (e.starts_at at time zone 'Africa/Johannesburg')::time <> s.start_time
      or (e.starts_at at time zone 'Africa/Johannesburg')::date < s.starts_on
      or (s.ends_on is not null and (e.starts_at at time zone 'Africa/Johannesburg')::date > s.ends_on)
    );

  if not s.active then return 0; end if;
  v_until := least(v_from + p_weeks * 7, coalesce(s.ends_on, v_from + p_weeks * 7));
  v_day := greatest(v_from, s.starts_on);
  while v_day <= v_until loop
    if extract(dow from v_day)::smallint = any (s.weekdays)
      and not exists (
        select 1 from public.events c
        where c.series_id = s.id and c.status = 'cancelled' and (c.starts_at at time zone 'Africa/Johannesburg')::date = v_day
      ) then
      v_start := (v_day + s.start_time) at time zone 'Africa/Johannesburg';
      if v_start > now() then
        insert into public.events (tenant_id, kind, series_id, staff_id, title, description, starts_at, ends_at,
          location, capacity, max_per_signup, price_cents, status, created_by)
        values (s.tenant_id, 'class', s.id, s.staff_id, s.title, s.description, v_start,
          v_start + make_interval(mins => s.duration_minutes), s.location, s.capacity, 1, s.price_cents, 'published', s.created_by)
        on conflict (series_id, starts_at) where series_id is not null do nothing;
        if found then v_created := v_created + 1; end if;
      end if;
    end if;
    v_day := v_day + 1;
  end loop;
  return v_created;
end;
$$;
-- Service role only: the dashboard confirms the series is the signed-in
-- user's (reading it through RLS) before syncing it, and the daily cron
-- keeps every active series eight weeks ahead.
revoke all on function public.sync_class_series(uuid, integer) from public, anon, authenticated;
grant execute on function public.sync_class_series(uuid, integer) to service_role;
