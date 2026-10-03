-- Security checks for FRIENDS / SHARING — PHASE 6 (subtasks of a shared task)
-- in supabase/schema.sql. Run in the Supabase SQL Editor AFTER schema.sql.
-- Everything happens inside one transaction that is ROLLED BACK at the end:
-- the test users and all their rows disappear; nothing is left behind.
-- A failing check aborts the script with "assert failed: <message>".
-- Users are impersonated the way PostgREST does it (role + JWT `sub`).
--
-- Cast: A = owner of the task, B = A's friend it is shared with, C = stranger.

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@subtask-test.local', '{"full_name":"Test A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@subtask-test.local', '{"full_name":"Test B"}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@subtask-test.local', '{"full_name":"Test C"}');
insert into public.connections (user_a, user_b)
values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');

-- A's tasks: one shared with B (two subtasks that already exist), one private,
-- one recurring. Two of the three keep updated_at in the past on purpose.
insert into public.tasks (id, user_id, title, priority, updated_at, shared_with_id, recurrence) values
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-00000000000a', 'Shared task', 'medium', now() - interval '1 hour', null, null),
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-00000000000a', 'Private task', 'medium', now() - interval '1 hour', null, null);
insert into public.subtasks (id, task_id, title, completed, position, updated_at) values
  ('00000000-0000-0000-0000-000000005a01', '00000000-0000-0000-0000-0000000000a5', 'Milk', 0, 0, now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000005a02', '00000000-0000-0000-0000-0000000000a5', 'Bread', 0, 1, now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000005a03', '00000000-0000-0000-0000-0000000000a6', 'Secret', 0, 0, now() - interval '1 hour');
-- The server timestamp is overwritten by a trigger on every write (and now() is
-- constant inside one transaction), so the trigger is switched off just to plant an old value.
alter table public.subtasks disable trigger trg_subtasks_server_updated;
update public.subtasks set server_updated_at = now() - interval '1 hour';
alter table public.subtasks enable trigger trg_subtasks_server_updated;

-- A shares the task with B (as postgres: the same UPDATE the client's push does).
do $$
declare before_ts timestamptz;
begin
  select min(server_updated_at) into before_ts from public.subtasks
  where task_id = '00000000-0000-0000-0000-0000000000a5';
  update public.tasks set shared_with_id = '00000000-0000-0000-0000-00000000000b'
  where id = '00000000-0000-0000-0000-0000000000a5';
  assert (select count(*) from public.subtasks
          where task_id = '00000000-0000-0000-0000-0000000000a5' and server_updated_at > before_ts) = 2,
    'sharing must move the server timestamp of the EXISTING subtasks, so the friend''s incremental pull receives them';
  assert (select count(*) from public.subtasks
          where task_id = '00000000-0000-0000-0000-0000000000a6' and server_updated_at > before_ts) = 0,
    'other tasks'' subtasks must not be touched';
  assert (select updated_at from public.subtasks where id = '00000000-0000-0000-0000-000000005a01') < now() - interval '30 minutes',
    'touching must not change updated_at (last-writer-wins stays intact)';
end $$;

-- ---------------------------------------------------------------- B: reads
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
-- Without the sharing header the friend sees neither the task nor its subtasks.
select set_config('request.headers', '{}', true);

do $$
begin
  assert (select count(*) from public.subtasks) = 0,
    'a client without the sharing capability must not receive shared subtasks';
end $$;

select set_config('request.headers', '{"x-erek-sharing":"1"}', true);

do $$
declare n int; r jsonb;
begin
  select count(*) into n from public.subtasks;
  assert n = 2, 'B must see exactly the two subtasks of the task shared with B, got ' || n;
  assert not exists (select 1 from public.subtasks where title = 'Secret'),
    'B must not see subtasks of tasks that are not shared';

  -- No direct writes of any kind.
  begin
    update public.subtasks set completed = 1 where id = '00000000-0000-0000-0000-000000005a01';
    assert (select completed from public.subtasks where id = '00000000-0000-0000-0000-000000005a01') = 0,
      'direct update by B must change nothing';
  exception when others then
    null;
  end;
  begin
    insert into public.subtasks (id, task_id, title, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a5', 'Injected', now());
    assert false, 'B must not insert subtasks into A''s task';
  exception when others then
    null; -- expected (RLS). OTHERS never swallows ASSERT_FAILURE.
  end;
  delete from public.subtasks where id = '00000000-0000-0000-0000-000000005a01';
  assert (select count(*) from public.subtasks) = 2, 'B must not delete subtasks';

  -- Not shared / unknown / foreign subtasks cannot be toggled.
  r := public.toggle_shared_subtask('00000000-0000-0000-0000-000000005a03', true);
  assert r->>'error' = 'ERK_NOT_SHARED', 'a subtask of an unshared task must be refused';
  r := public.toggle_shared_subtask(gen_random_uuid(), true);
  assert r->>'error' = 'ERK_NOT_SHARED', 'an unknown subtask must look the same as a foreign one';
end $$;

-- ------------------------------------------------- B: ticks, parent follows
do $$
declare r jsonb;
begin
  r := public.toggle_shared_subtask('00000000-0000-0000-0000-000000005a01', true);
  assert (r->>'completed')::int = 1, 'the subtask must be ticked, got ' || r::text;
  assert r->>'task_completed_at' is null, 'the task stays open while a subtask is open, got ' || r::text;
  assert (r->>'subtask_updated_at')::timestamptz > now() - interval '1 minute', 'the tick must carry a fresh updated_at';

  r := public.toggle_shared_subtask('00000000-0000-0000-0000-000000005a02', true);
  assert r->>'task_completed_at' is not null, 'ticking the last subtask must complete the task, got ' || r::text;
  assert r->>'task_completed_at' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$',
    'completed_at must use the app''s ISO format, got ' || (r->>'task_completed_at');

  r := public.toggle_shared_subtask('00000000-0000-0000-0000-000000005a01', false);
  assert (r->>'completed')::int = 0 and r->>'task_completed_at' is null,
    'unticking a subtask must reopen the task, got ' || r::text;
end $$;

-- ----------------------------------------- A: an offline edit can't undo it
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select set_config('request.headers', '{"x-erek-sharing":"1"}', true);

do $$
begin
  -- B's tick (subtask 2) is fresh. A's device pushes an OLD edit of the same row.
  update public.subtasks
  set title = 'Bread (renamed)', completed = 0, updated_at = now() - interval '2 hours'
  where id = '00000000-0000-0000-0000-000000005a02';
  assert (select completed from public.subtasks where id = '00000000-0000-0000-0000-000000005a02') = 1,
    'an older offline edit must not undo the friend''s tick';
  assert (select title from public.subtasks where id = '00000000-0000-0000-0000-000000005a02') = 'Bread (renamed)',
    'the rest of the older edit still goes through';
  -- A's own, newer action wins as usual.
  update public.subtasks set completed = 0, updated_at = now() + interval '1 minute'
  where id = '00000000-0000-0000-0000-000000005a02';
  assert (select completed from public.subtasks where id = '00000000-0000-0000-0000-000000005a02') = 0,
    'a newer owner edit must apply';
  assert (select count(*) from public.subtasks) = 3, 'A still sees all of their own subtasks';
end $$;

-- ------------------------------------------------------ C: a stranger
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  assert (select count(*) from public.subtasks) = 0, 'a stranger must see no subtasks';
  r := public.toggle_shared_subtask('00000000-0000-0000-0000-000000005a01', true);
  assert r->>'error' = 'ERK_NOT_SHARED', 'a stranger must not toggle shared subtasks';
end $$;

-- ------------------------------------ friendship row gone, share row still there
-- remove_connection() clears both; this is the defence in depth if only the
-- connection ever disappears: the friend must still be refused.
reset role;
delete from public.connections;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select set_config('request.headers', '{"x-erek-sharing":"1"}', true);
do $$
declare r jsonb;
begin
  r := public.toggle_shared_subtask('00000000-0000-0000-0000-000000005a02', true);
  assert r->>'error' = 'ERK_NOT_SHARED', 'without a friendship the friend must be refused even if the share row remains';
end $$;
reset role;
insert into public.connections (user_a, user_b)
values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');

-- --------------------------------------------- recurring tasks / deleted
reset role;
update public.tasks set recurrence = '{"freq":"daily"}' where id = '00000000-0000-0000-0000-0000000000a5';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select set_config('request.headers', '{"x-erek-sharing":"1"}', true);
do $$
declare r jsonb;
begin
  r := public.toggle_shared_subtask('00000000-0000-0000-0000-000000005a01', true);
  assert r->>'error' = 'ERK_NOT_SHARED', 'subtasks of a recurring task can''t be toggled by the friend';
end $$;

reset role;
update public.tasks set recurrence = null where id = '00000000-0000-0000-0000-0000000000a5';
update public.subtasks set deleted_at = now() where id = '00000000-0000-0000-0000-000000005a01';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select set_config('request.headers', '{"x-erek-sharing":"1"}', true);
do $$
declare r jsonb;
begin
  r := public.toggle_shared_subtask('00000000-0000-0000-0000-000000005a01', true);
  assert r->>'error' = 'ERK_NOT_SHARED', 'a deleted subtask can''t be toggled';
end $$;

-- ------------------------------------------------------ B: unfriend / unshare
do $$ begin
  perform public.remove_connection('00000000-0000-0000-0000-00000000000a');
end $$;
select set_config('request.headers', '{"x-erek-sharing":"1"}', true);
do $$
declare r jsonb;
begin
  assert (select count(*) from public.subtasks) = 0, 'after unfriending B must see no subtasks';
  r := public.toggle_shared_subtask('00000000-0000-0000-0000-000000005a02', true);
  assert r->>'error' = 'ERK_NOT_SHARED', 'after unfriending nothing can be toggled';
end $$;

select 'ALL SUBTASK SHARE CHECKS PASSED' as result;
rollback;
