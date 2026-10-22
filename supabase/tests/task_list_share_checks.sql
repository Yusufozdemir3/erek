-- Checks for FRIENDS / SHARING — PHASE 8 (shopping-list tasks: several friends,
-- recipients tick / add / remove items) in supabase/schema.sql. Run in the
-- Supabase SQL Editor AFTER schema.sql. Everything happens inside one
-- transaction that is ROLLED BACK at the end: nothing is left behind.
-- A failing check aborts the script with "assert failed: <message>".
-- Users are impersonated the way PostgREST does it (role + JWT `sub`), and the
-- owner's writes are the same upserts the app's sync push sends.
--
-- Cast: A = owner, B and D = A's friends, C = a stranger to A.

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@list-test.local', '{}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@list-test.local', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@list-test.local', '{}'),
  ('00000000-0000-0000-0000-00000000000d', 'd@list-test.local', '{}');
insert into public.connections (user_a, user_b) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d');

-- ------------------------------------------------- A: creates a shared list
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select set_config('request.headers', '{"x-erek-sharing":"1"}', true);
-- Targets: B (friend), C (stranger), A (self), garbage — only B may stay.
insert into public.tasks (id, user_id, title, priority, updated_at, shared_with_ids) values
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-00000000000a', 'Groceries', 'medium', now() - interval '1 hour',
   '["00000000-0000-0000-0000-00000000000b","00000000-0000-0000-0000-00000000000c","00000000-0000-0000-0000-00000000000a","not-a-uuid"]');
insert into public.subtasks (id, task_id, title, completed, position, updated_at, completed_by) values
  ('00000000-0000-0000-0000-000000005a01', '00000000-0000-0000-0000-0000000000a5', 'Milk', 0, 0, now() - interval '1 hour', null),
  ('00000000-0000-0000-0000-000000005a02', '00000000-0000-0000-0000-0000000000a5', 'Bread', 0, 1, now() - interval '1 hour', null);

do $$ begin
  assert (select shared_with_ids from public.tasks where id = '00000000-0000-0000-0000-0000000000a5')
         = '["00000000-0000-0000-0000-00000000000b"]',
    'only connected friends stay in the list (no stranger, no self, no garbage)';
  assert (select shared_with_id from public.tasks where id = '00000000-0000-0000-0000-0000000000a5')
         = '00000000-0000-0000-0000-00000000000b',
    'the legacy column holds the first friend';
  assert (select updated_at from public.tasks where id = '00000000-0000-0000-0000-0000000000a5') > now() - interval '1 minute',
    'a corrected list bumps updated_at so the owner''s devices adopt it';
  assert (select count(*) from public.task_shares where task_id = '00000000-0000-0000-0000-0000000000a5') = 1,
    'task_shares follows the validated list';
end $$;

-- A adds D. Existing items must reach D's incremental pull.
reset role;
alter table public.subtasks disable trigger trg_subtasks_server_updated;
update public.subtasks set server_updated_at = now() - interval '1 hour';
alter table public.subtasks enable trigger trg_subtasks_server_updated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
update public.tasks
set shared_with_ids = '["00000000-0000-0000-0000-00000000000b","00000000-0000-0000-0000-00000000000d"]', updated_at = now()
where id = '00000000-0000-0000-0000-0000000000a5';
do $$ begin
  assert (select count(*) from public.task_shares where task_id = '00000000-0000-0000-0000-0000000000a5') = 2,
    'both friends are in task_shares';
  assert (select count(*) from public.subtasks where task_id = '00000000-0000-0000-0000-0000000000a5'
          and server_updated_at > now() - interval '1 minute') = 2,
    'adding a recipient touches the existing items';
end $$;

-- ------------------------------------------------------------- B: reads
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select set_config('request.headers', '{}', true);
do $$ begin
  assert (select count(*) from public.tasks) = 0, 'without the sharing header B sees no shared task';
end $$;
select set_config('request.headers', '{"x-erek-sharing":"1"}', true);
do $$
declare n int;
begin
  assert (select count(*) from public.tasks) = 1, 'B sees the shared task';
  assert (select count(*) from public.subtasks) = 2, 'B sees its items';
  -- RLS keeps every direct write owner-only.
  update public.tasks set title = 'hacked' where id = '00000000-0000-0000-0000-0000000000a5';
  get diagnostics n = row_count;
  assert n = 0, 'B can''t edit the task directly';
  update public.subtasks set title = 'hacked' where id = '00000000-0000-0000-0000-000000005a01';
  get diagnostics n = row_count;
  assert n = 0, 'B can''t edit an item directly';
end $$;

-- --------------------------------------------- B: tick, add, remove items
do $$
declare r jsonb;
begin
  r := public.toggle_shared_subtask('00000000-0000-0000-0000-000000005a01', true);
  assert r->>'completed_by' = '00000000-0000-0000-0000-00000000000b', 'the server records who ticked it';
  assert r->>'task_completed_at' is null, 'one open item left: the task stays open';

  r := public.add_shared_subtask('00000000-0000-0000-0000-0000000000a5', '   ');
  assert r->>'error' = 'ERK_INVALID_TITLE', 'a blank title is refused';
  r := public.add_shared_subtask('00000000-0000-0000-0000-0000000000a5', 'Eggs');
  assert r->>'subtask_id' is not null and (r->>'position')::int = 2, 'B adds an item at the end';

  -- Bread and Eggs done -> the whole list is done.
  r := public.toggle_shared_subtask('00000000-0000-0000-0000-000000005a02', true);
  r := public.toggle_shared_subtask((select id from public.subtasks where title = 'Eggs'), true);
  assert r->>'task_completed_at' is not null, 'all items done completes the task';

  -- Removing a done item keeps it done; adding one reopens it.
  r := public.delete_shared_subtask('00000000-0000-0000-0000-000000005a02');
  assert r->>'task_completed_at' is not null, 'what is left is all done: still complete';
  r := public.add_shared_subtask('00000000-0000-0000-0000-0000000000a5', 'Butter');
  assert r->>'task_completed_at' is null, 'a new item reopens the task';
end $$;

-- ------------------------------------------- D: sees B's work and names
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.subtasks where deleted_at is null) = 3, 'D sees Milk, Eggs, Butter';
  assert (select completed_by from public.subtasks where id = '00000000-0000-0000-0000-000000005a01')
         = '00000000-0000-0000-0000-00000000000b', 'D sees who ticked Milk';
  assert (select count(*) from public.get_task_participants('00000000-0000-0000-0000-0000000000a5')) = 3,
    'participants: the owner and both recipients';
end $$;

-- ------------------------------------------------------- C: locked out
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  assert (select count(*) from public.tasks) = 0, 'C sees nothing';
  assert (select count(*) from public.subtasks) = 0, 'C sees no items';
  assert (select count(*) from public.get_task_participants('00000000-0000-0000-0000-0000000000a5')) = 0,
    'C gets no participant names';
  r := public.toggle_shared_subtask('00000000-0000-0000-0000-000000005a01', false);
  assert r->>'error' = 'ERK_NOT_SHARED', 'C can''t tick';
  r := public.add_shared_subtask('00000000-0000-0000-0000-0000000000a5', 'Spam');
  assert r->>'error' = 'ERK_NOT_SHARED', 'C can''t add';
  r := public.delete_shared_subtask('00000000-0000-0000-0000-000000005a01');
  assert r->>'error' = 'ERK_NOT_SHARED', 'C can''t remove';
  r := public.toggle_shared_task('00000000-0000-0000-0000-0000000000a5', true);
  assert r->>'error' = 'ERK_NOT_SHARED', 'C can''t complete the task';
end $$;

-- ------------------------------- A: an OFFLINE edit can't undo a friend's tick
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
update public.subtasks set completed = 0, title = 'Oat milk', updated_at = now() - interval '2 hours'
where id = '00000000-0000-0000-0000-000000005a01';
do $$ begin
  assert (select completed from public.subtasks where id = '00000000-0000-0000-0000-000000005a01') = 1,
    'an older owner edit keeps the friend''s tick';
  assert (select completed_by from public.subtasks where id = '00000000-0000-0000-0000-000000005a01')
         = '00000000-0000-0000-0000-00000000000b', '... and who ticked it';
end $$;

-- An older (single-friend) client changes only shared_with_id: that means "just D".
update public.tasks set shared_with_id = '00000000-0000-0000-0000-00000000000d', updated_at = now()
where id = '00000000-0000-0000-0000-0000000000a5';
do $$ begin
  assert (select shared_with_ids from public.tasks where id = '00000000-0000-0000-0000-0000000000a5')
         = '["00000000-0000-0000-0000-00000000000d"]', 'an older client''s single share becomes the list';
  assert (select count(*) from public.task_shares where task_id = '00000000-0000-0000-0000-0000000000a5') = 1,
    'B is no longer a recipient';
end $$;

-- ------------------------------------------- D: unfriends A, loses the list
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
do $$ begin
  perform public.remove_connection('00000000-0000-0000-0000-00000000000a');
  assert (select count(*) from public.tasks) = 0, 'after unfriending D sees nothing';
end $$;
reset role;
do $$ begin
  assert (select shared_with_ids from public.tasks where id = '00000000-0000-0000-0000-0000000000a5') is null,
    'the owner''s list drops the ex-friend (adopted by A''s devices through updated_at)';
end $$;

select 'ALL TASK LIST SHARE CHECKS PASSED' as result;
rollback;
