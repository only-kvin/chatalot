-- Keeps a booking's blocked time in step with its appointment time for any
-- write that doesn't set it (anything other than create_booking() and
-- reschedule_booking()): a new row blocks exactly its appointment, and a
-- moved one keeps the buffers it had.

create function private.sync_booking_block() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.block_start := coalesce(new.block_start, new.starts_at);
    new.block_end := coalesce(new.block_end, new.ends_at);
  else
    if new.block_start is not distinct from old.block_start and new.starts_at is distinct from old.starts_at then
      new.block_start := new.starts_at - (old.starts_at - old.block_start);
    end if;
    if new.block_end is not distinct from old.block_end and new.ends_at is distinct from old.ends_at then
      new.block_end := new.ends_at + (old.block_end - old.ends_at);
    end if;
  end if;
  return new;
end;
$$;

create trigger bookings_sync_block
  before insert or update of starts_at, ends_at, block_start, block_end on public.bookings
  for each row execute function private.sync_booking_block();
