-- The inbox list shows each conversation's latest message. One query for
-- the whole list instead of one per conversation. Security invoker, so RLS
-- on messages still decides what the caller can see.

create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc);

create function public.conversation_previews(p_tenant_id uuid, p_ids uuid[])
returns table (conversation_id uuid, role text, content text, sent_by uuid, created_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (m.conversation_id) m.conversation_id, m.role, m.content, m.sent_by, m.created_at
  from public.messages m
  where m.tenant_id = p_tenant_id
    and m.conversation_id = any (p_ids)
    and m.role in ('user', 'assistant')
  order by m.conversation_id, m.created_at desc;
$$;

revoke execute on function public.conversation_previews(uuid, uuid[]) from public, anon;
grant execute on function public.conversation_previews(uuid, uuid[]) to authenticated;
