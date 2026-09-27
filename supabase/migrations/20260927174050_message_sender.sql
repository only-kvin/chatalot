-- Who wrote an assistant-side message. Null = the AI (or a system message
-- like the handoff confirmation); set = a dashboard user replying by hand.
-- Owner replies keep role 'assistant' so the AI reads them as the business's
-- side of the conversation if it's handed back; this column is only for
-- labelling them in the transcript.
alter table public.messages
  add column sent_by uuid references auth.users (id) on delete set null;

-- Supports the FK's on-delete lookup; only owner replies have a value.
create index messages_sent_by_idx on public.messages (sent_by) where sent_by is not null;

-- The shared "tenant isolation" policy lets any member write any row in their
-- tenant, which would let one member post as another. Restrictive policies
-- are ANDed with it: a dashboard user may only attribute a message to
-- themselves. (The service-role webhook bypasses RLS and never sets it.)
create policy "sent_by is the current user on insert" on public.messages
  as restrictive
  for insert
  to authenticated
  with check (sent_by is null or sent_by = (select auth.uid()));

create policy "sent_by is the current user on update" on public.messages
  as restrictive
  for update
  to authenticated
  using (true)
  with check (sent_by is null or sent_by = (select auth.uid()));
