-- Widget suite, Phase E1: consent history and the contact widget.

-- Every consent a customer gives or withdraws, never overwritten, so a
-- business can show when and where someone agreed (POPIA). The current
-- state is the latest row per contact and kind; contacts.marketing_opt_in_at
-- mirrors the marketing one for quick checks.
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  kind text not null check (kind in ('booking_notifications', 'marketing', 'newsletter')),
  granted boolean not null,
  -- Where it happened: contact_widget, registration_widget, customer_page...
  source text not null check (length(source) between 1 and 40),
  created_at timestamptz not null default now()
);
create index consents_contact_idx on public.consents (tenant_id, contact_id, kind, created_at desc);

-- Messages from the website contact form.
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- Only when they ticked a consent (otherwise just the message is kept).
  contact_id uuid references public.contacts (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  name text not null,
  email text,
  phone text,
  subject text,
  message text not null,
  -- Answers to the business's own extra questions.
  details jsonb not null default '{}',
  status text not null default 'new' check (status in ('new', 'read', 'replied')),
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);
create index contact_messages_tenant_idx on public.contact_messages (tenant_id, created_at desc);
create index contact_messages_contact_idx on public.contact_messages (contact_id) where contact_id is not null;
create index contact_messages_lead_idx on public.contact_messages (lead_id) where lead_id is not null;

-- Dashboard members read their business's rows and update a message's
-- status; rows are written by the service-role backend. Consents are never
-- edited or deleted from the dashboard.
alter table public.consents enable row level security;
alter table public.consents force row level security;
alter table public.contact_messages enable row level security;
alter table public.contact_messages force row level security;
revoke all on public.consents, public.contact_messages from anon;
revoke insert, update, delete on public.consents from authenticated;
revoke insert, delete on public.contact_messages from authenticated;

create policy "members read their tenant's consents" on public.consents
  for select to authenticated
  using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()));

create policy "members read their tenant's messages" on public.contact_messages
  for select to authenticated
  using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()));
create policy "members update their tenant's messages" on public.contact_messages
  for update to authenticated
  using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()))
  with check (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()));
-- Only the status column is the dashboard's to change.
revoke update on public.contact_messages from authenticated;
grant update (status) on public.contact_messages to authenticated;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'human_requested', 'new_lead', 'new_booking', 'booking_cancelled', 'booking_rescheduled',
    'reminder_not_sent', 'low_rating', 'approval_needed', 'contact_message'
  ));
