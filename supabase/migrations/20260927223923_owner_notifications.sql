-- In-app alerts for business owners ("someone needs you"), shown as the
-- dashboard bell. Written alongside each owner email by the service-role
-- backend; dashboard users can only read them and mark them read.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  type text not null check (type in ('human_requested', 'new_lead', 'new_booking')),
  title text not null,
  body text not null default '',
  -- Where "open" takes the owner; null when there's no single conversation.
  conversation_id uuid references public.conversations (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_tenant_created_idx on public.notifications (tenant_id, created_at desc);
create index notifications_conversation_id_idx on public.notifications (conversation_id)
  where conversation_id is not null;

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

-- Only the backend creates or deletes notifications, and members may change
-- nothing but read_at — enforced with column privileges, not just policy.
revoke all on public.notifications from anon;
revoke insert, update, delete on public.notifications from authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "members read their tenant's notifications" on public.notifications
  for select
  to authenticated
  using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()));

-- UPDATE needs the SELECT policy above too (it reads the row first).
create policy "members mark their tenant's notifications read" on public.notifications
  for update
  to authenticated
  using (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()))
  with check (tenant_id in (select private.my_tenant_ids()) or (select private.is_platform_admin()));
