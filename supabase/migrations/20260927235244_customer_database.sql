-- Customer database: one contact per person per business, linked from every
-- conversation, lead and booking. contacts and the contact_id columns existed
-- since the first schema but were never filled in.

alter table public.contacts
  -- Identity: the phone in one canonical form (country code, digits only,
  -- e.g. 27821234567). "068 219 0818" and WhatsApp's "27682190818" must be
  -- the same person. Kept separate from `phone`, which is shown as given.
  add column phone_e164 text,
  add column first_channel text check (first_channel in ('web', 'whatsapp')),
  -- Who set `name`, so a name the customer typed isn't replaced by their
  -- WhatsApp profile name, and an owner's edit wins over both.
  add column name_source text check (name_source in ('whatsapp_profile', 'customer', 'owner')),
  add column notes text,
  add column first_seen_at timestamptz not null default now(),
  add column last_seen_at timestamptz not null default now(),
  -- For later win-back messages (POPIA: direct marketing needs opt-in).
  -- consent_at (already here) is consent to store contact details.
  add column marketing_opt_in_at timestamptz,
  add column opted_out_at timestamptz,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

create unique index contacts_tenant_phone_key on public.contacts (tenant_id, phone_e164);
-- Email identifies a customer only when there's no phone.
create unique index contacts_tenant_email_key on public.contacts (tenant_id, lower(email))
  where phone_e164 is null and email is not null;
create index contacts_tenant_last_seen_idx on public.contacts (tenant_id, last_seen_at desc);

create index conversations_contact_id_idx on public.conversations (contact_id);
create index leads_contact_id_idx on public.leads (contact_id);
create index bookings_contact_id_idx on public.bookings (contact_id);

-- ---------------------------------------------------------------------------
-- Backfill from existing data. Same rules as lib/contacts/phone.ts:
-- strip non-digits; a 10-digit local number starting 0 is South African.
-- ---------------------------------------------------------------------------
create function pg_temp.canonical_phone(raw text) returns text
language sql immutable as $$
  select case
    when d ~ '^0[0-9]{9}$' then '27' || substr(d, 2)
    when d ~ '^[1-9][0-9]{9,14}$' then d
  end
  from (select regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g') as d) s
$$;

-- Leads and bookings first: their names were typed by the customer, after consent.
insert into public.contacts (tenant_id, name, name_source, phone, phone_e164, email, consent_at, first_channel, first_seen_at, last_seen_at)
select distinct on (tenant_id, pg_temp.canonical_phone(phone))
  tenant_id, name, 'customer', phone, pg_temp.canonical_phone(phone), email, created_at,
  case when source = 'whatsapp' then 'whatsapp' else 'web' end, created_at, created_at
from (
  select tenant_id, name, phone, email, created_at, source from public.leads
  union all
  select tenant_id, name, phone, email, created_at, 'web' from public.bookings
) people
where pg_temp.canonical_phone(phone) is not null
order by tenant_id, pg_temp.canonical_phone(phone), created_at desc
on conflict (tenant_id, phone_e164) do nothing;

-- WhatsApp senders: their number is known even if they never gave a name.
insert into public.contacts (tenant_id, phone, phone_e164, first_channel, first_seen_at, last_seen_at)
select c.tenant_id, c.external_id, pg_temp.canonical_phone(c.external_id), 'whatsapp',
  coalesce((select min(m.created_at) from public.messages m where m.conversation_id = c.id), c.last_message_at),
  c.last_message_at
from public.conversations c
where c.channel = 'whatsapp' and pg_temp.canonical_phone(c.external_id) is not null
on conflict (tenant_id, phone_e164) do update
  set first_channel = 'whatsapp',
      first_seen_at = least(public.contacts.first_seen_at, excluded.first_seen_at),
      last_seen_at = greatest(public.contacts.last_seen_at, excluded.last_seen_at);

update public.conversations c set contact_id = ct.id
from public.contacts ct
where c.channel = 'whatsapp' and ct.tenant_id = c.tenant_id
  and ct.phone_e164 = pg_temp.canonical_phone(c.external_id);

update public.leads l set contact_id = ct.id
from public.contacts ct
where ct.tenant_id = l.tenant_id and ct.phone_e164 = pg_temp.canonical_phone(l.phone);

update public.bookings b set contact_id = ct.id
from public.contacts ct
where ct.tenant_id = b.tenant_id and ct.phone_e164 = pg_temp.canonical_phone(b.phone);

-- A website chat becomes a known customer once they left details in it.
update public.conversations c set contact_id = l.contact_id
from public.leads l
where l.conversation_id = c.id and c.contact_id is null and l.contact_id is not null;

-- Members may delete their tenant's notifications — needed by the function
-- below (it runs with their rights) to remove alerts that name the customer.
grant delete on public.notifications to authenticated;
create policy "members delete their tenant's notifications" on public.notifications
  for delete
  to authenticated
  using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()));

-- ---------------------------------------------------------------------------
-- "Delete customer and their data" (POPIA deletion requests). SECURITY
-- INVOKER: runs as the dashboard user, so RLS limits it to their own tenant
-- and a contact they can't see simply isn't found. One function so the
-- deletes are atomic. Messages go with their conversations (cascade).
-- ---------------------------------------------------------------------------
create function public.delete_contact_with_history(p_contact_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_conversations uuid[];
  v_bookings int;
  v_leads int;
  v_conv_count int;
begin
  select tenant_id into v_tenant from public.contacts where id = p_contact_id;
  if v_tenant is null then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(id), '{}') into v_conversations
  from public.conversations where contact_id = p_contact_id and tenant_id = v_tenant;

  delete from public.bookings
  where tenant_id = v_tenant and (contact_id = p_contact_id or conversation_id = any(v_conversations));
  get diagnostics v_bookings = row_count;

  delete from public.leads
  where tenant_id = v_tenant and (contact_id = p_contact_id or conversation_id = any(v_conversations));
  get diagnostics v_leads = row_count;

  -- Alerts about this customer (their bodies can quote names or reasons).
  delete from public.notifications
  where tenant_id = v_tenant and conversation_id = any(v_conversations);

  delete from public.conversations where tenant_id = v_tenant and id = any(v_conversations);
  get diagnostics v_conv_count = row_count;

  delete from public.contacts where id = p_contact_id and tenant_id = v_tenant;

  return jsonb_build_object('conversations', v_conv_count, 'leads', v_leads, 'bookings', v_bookings);
end;
$$;

revoke execute on function public.delete_contact_with_history(uuid) from public, anon;
grant execute on function public.delete_contact_with_history(uuid) to authenticated;
