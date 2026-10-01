-- Security checks for the FRIENDS / SHARING section of supabase/schema.sql.
-- Run in the Supabase SQL Editor AFTER schema.sql. Everything happens inside
-- one transaction that is ROLLED BACK at the end: the test users and all their
-- rows disappear; nothing is left behind in the project.
-- A failing check aborts the script with "assert failed: <message>".
-- Users are impersonated the same way PostgREST does it: role `authenticated`
-- plus a JWT `sub` claim, which is what auth.uid() reads.
--
-- Cast: A = inviter/owner, B = A's friend, C = stranger.

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@sharing-test.local',
   '{"full_name":"Test A","avatar_url":"https://evil.example.com/p.googleusercontent.com/x.png"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@sharing-test.local',
   '{"full_name":"Test B","avatar_url":"https://lh3.googleusercontent.com/a/abc"}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@sharing-test.local',
   '{"full_name":"Test C"}');

insert into public.habits (id, user_id, title, goal_id, remind_at, updated_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'A run', null, '07:00', now()),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'B read', null, null, now());
insert into public.habit_logs (id, habit_id, log_date, completed, amount, updated_at) values
  ('00000000-0000-0000-0000-000000000a11', '00000000-0000-0000-0000-0000000000a1', '2026-09-28', 1, 0, now()),
  ('00000000-0000-0000-0000-000000000a12', '00000000-0000-0000-0000-0000000000a1', '2026-09-29', 1, 0, now());
-- A's goals: numeric (baseline 10 + A's own entry 20 = 30) and a milestone one.
insert into public.goals (id, user_id, title, goal_type, target_value, current_value, value_baseline, updated_at) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a', 'Run 100 km', 'numeric', 100, 30, 10, now()),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000000a', 'Move house', 'milestone', null, 0, 0, now());
insert into public.goal_entries (id, goal_id, amount, updated_at) values
  ('00000000-0000-0000-0000-000000000a31', '00000000-0000-0000-0000-0000000000a3', 20, now() - interval '1 day');

-- 1) Profiles are created by the trigger; a non-Google avatar host is dropped.
do $$ begin
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'Test A',
    'profile trigger must copy full_name';
  assert (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-00000000000a') is null,
    'avatar on a lookalike host must be rejected';
  assert (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-00000000000b')
         = 'https://lh3.googleusercontent.com/a/abc',
    'google avatar must be kept';
end $$;

-- ---------------------------------------------------------------- A: invite
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
declare c1 text; c2 text; r jsonb;
begin
  select code into c1 from public.get_or_create_invite();
  select code into c2 from public.get_or_create_invite();
  assert c1 = c2, 'repeated calls must return the same live code';
  assert c1 ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$', 'code must be 8 chars from the safe alphabet';
  perform set_config('test.code_a', c1, true);

  r := public.redeem_invite(c1);
  assert r->>'error' = 'ERK_INVITE_SELF', 'own code must be refused';

  r := public.share_habit('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b');
  assert r->>'error' = 'ERK_NOT_CONNECTED', 'sharing with a non-friend must be refused';
end $$;

-- ---------------------------------------------------------------- B: connect
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

do $$
declare r jsonb; n int;
begin
  select count(*) into n from public.friend_invites;
  assert n = 0, 'B must not see A''s invites';
  select count(*) into n from public.profiles where id <> '00000000-0000-0000-0000-00000000000b';
  assert n = 0, 'B must not read other profiles directly';

  begin
    insert into public.connections (user_a, user_b)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
    assert false, 'direct insert into connections must be blocked';
  exception when others then
    null; -- expected (RLS). OTHERS never swallows ASSERT_FAILURE, so the assert above still fails the run.
  end;

  -- Lower case + separators are normalized server-side.
  r := public.redeem_invite(lower(substr(current_setting('test.code_a'), 1, 4)) || '-' ||
                            lower(substr(current_setting('test.code_a'), 5, 4)));
  assert r->'friend'->>'id' = '00000000-0000-0000-0000-00000000000a', 'valid code must connect B to A';
  assert r->'friend'->>'display_name' = 'Test A', 'redeem must return the inviter''s profile';

  r := public.redeem_invite(current_setting('test.code_a'));
  assert r->>'error' = 'ERK_INVITE_INVALID', 'a used code must not work twice';

  assert public.are_connected('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'),
    'A and B must be connected';
  select count(*) into n from public.list_connections() where display_name = 'Test A';
  assert n = 1, 'B''s friend list must show A';
end $$;

-- ---------------------------------------------------------------- A: share
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
declare r jsonb;
begin
  r := public.share_habit('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b');
  assert r->>'error' = 'ERK_HABIT_NOT_SYNCED', 'A must not be able to share B''s habit';
  r := public.share_habit('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000c');
  assert r->>'error' = 'ERK_NOT_CONNECTED', 'A must not share with a stranger';
  r := public.share_habit('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b');
  assert (r->>'ok')::boolean, 'A must be able to share own habit with a friend';
end $$;

-- A pushes tasks through RLS exactly like the sync engine's upsert would.
insert into public.tasks (id, user_id, title, recurrence, updated_at, shared_with_id) values
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-00000000000a', 'Shared', null,
   now() - interval '1 day', '00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-00000000000a', 'To stranger', null,
   now() - interval '1 day', '00000000-0000-0000-0000-00000000000c'),
  ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-00000000000a', 'Recurring', '{"freq":"daily"}',
   now() - interval '1 day', '00000000-0000-0000-0000-00000000000b');

do $$ begin
  assert (select shared_with_id from public.tasks where id = '00000000-0000-0000-0000-0000000000a5')
         = '00000000-0000-0000-0000-00000000000b', 'a share to a friend must stick';
  assert (select shared_with_id from public.tasks where id = '00000000-0000-0000-0000-0000000000a6') is null,
    'a share to a stranger must be dropped (not raised: a raise would wedge the owner''s sync)';
  assert (select updated_at from public.tasks where id = '00000000-0000-0000-0000-0000000000a6') > now() - interval '1 minute',
    'the correction must bump updated_at so the owner''s devices adopt it';
  assert (select shared_with_id from public.tasks where id = '00000000-0000-0000-0000-0000000000a7') is null,
    'a recurring task must not be shareable';
end $$;

-- ---------------------------------------------------------------- B: read shared habit
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- The habits/habit_logs tables themselves stay closed: this is what keeps a
  -- friend's habit out of B's own sync pull and habit list.
  select count(*) into n from public.habits where user_id = '00000000-0000-0000-0000-00000000000a';
  assert n = 0, 'B must not read A''s habits table rows directly';
  select count(*) into n from public.habit_logs where habit_id = '00000000-0000-0000-0000-0000000000a1';
  assert n = 0, 'B must not read A''s habit_logs directly';

  select count(*) into n from public.get_shared_habits();
  assert n = 1, 'B must see exactly the one habit shared with them';
  select count(*) into n from public.get_shared_habit_logs('00000000-0000-0000-0000-0000000000a1');
  assert n = 2, 'B must get the shared habit''s logs via the RPC';

  begin
    insert into public.habit_shares (habit_id, owner_id, shared_with_id)
    values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a',
            '00000000-0000-0000-0000-00000000000b');
    assert false, 'direct insert into habit_shares must be blocked';
  exception when others then
    null;
  end;
end $$;

-- An OLDER app version doesn't send the capability header: it must not see the
-- friend's task at all (it would store it as its own and wedge its sync).
select set_config('request.headers', '{}', true);
do $$
declare n int;
begin
  select count(*) into n from public.tasks where user_id = '00000000-0000-0000-0000-00000000000a';
  assert n = 0, 'a client without the sharing header must not receive tasks shared with it';
end $$;

-- From here on every caller is a current client (header set for the rest of the transaction).
select set_config('request.headers', '{"x-erek-sharing":"1"}', true);

do $$
declare n int; r jsonb;
begin
  select count(*) into n from public.tasks where user_id = '00000000-0000-0000-0000-00000000000a';
  assert n = 1, 'B must see exactly the one task shared with them (it arrives via the normal pull)';

  update public.tasks set title = 'hijacked', user_id = '00000000-0000-0000-0000-00000000000b'
  where id = '00000000-0000-0000-0000-0000000000a5';
  get diagnostics n = row_count;
  assert n = 0, 'B must not be able to UPDATE a shared task directly (RLS: owner only)';

  delete from public.tasks where id = '00000000-0000-0000-0000-0000000000a5';
  get diagnostics n = row_count;
  assert n = 0, 'B must not be able to DELETE a shared task';

  r := public.toggle_shared_task('00000000-0000-0000-0000-0000000000a5', true);
  assert r->>'completed_at' is not null, 'B must be able to check the shared task off';
  assert (select title from public.tasks where id = '00000000-0000-0000-0000-0000000000a5') = 'Shared',
    'the toggle must touch completion only';

  r := public.toggle_shared_task('00000000-0000-0000-0000-0000000000a7', true);
  assert r->>'error' = 'ERK_NOT_SHARED', 'B must not toggle a task that isn''t shared with them';
end $$;

-- ---------------------------------------------------------------- A: stale offline edit
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$ begin
  -- An edit A made OFFLINE before B's check-off arrives late with an older timestamp.
  update public.tasks
  set title = 'Renamed offline', completed_at = null, updated_at = now() - interval '1 hour'
  where id = '00000000-0000-0000-0000-0000000000a5';
  assert (select title from public.tasks where id = '00000000-0000-0000-0000-0000000000a5') = 'Renamed offline',
    'the owner''s other edits must go through';
  assert (select completed_at from public.tasks where id = '00000000-0000-0000-0000-0000000000a5') is not null,
    'a stale owner write must not undo the friend''s newer check-off';
end $$;

-- ---------------------------------------------------------------- A: share goals
do $$
declare r jsonb;
begin
  r := public.share_goal('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000c');
  assert r->>'error' = 'ERK_NOT_CONNECTED', 'A must not share a goal with a stranger';
  r := public.share_goal('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000b');
  assert (r->>'ok')::boolean, 'A must be able to share own goal with a friend';
  r := public.share_goal('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000000b');
  assert (r->>'ok')::boolean, 'a milestone goal must be shareable too (read-only)';
end $$;

-- ---------------------------------------------------------------- B: view + contribute
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

do $$
declare n int; r jsonb; d jsonb;
begin
  -- The goals/goal_entries tables stay closed: the goal never enters B's own sync pull.
  select count(*) into n from public.goals where user_id = '00000000-0000-0000-0000-00000000000a';
  assert n = 0, 'B must not read A''s goals table rows directly';
  select count(*) into n from public.goal_entries where goal_id = '00000000-0000-0000-0000-0000000000a3';
  assert n = 0, 'B must not read A''s goal_entries directly';

  select count(*) into n from public.get_shared_goals();
  assert n = 2, 'B must see both goals shared with them';
  assert (select current_value from public.get_shared_goals() where id = '00000000-0000-0000-0000-0000000000a3') = 30,
    'shared goal value must be derived (baseline + entries), not the owner''s cache';

  r := public.add_shared_goal_entry('00000000-0000-0000-0000-0000000000a3', 5);
  assert (r->>'applied')::float8 = 5 and (r->>'current_value')::float8 = 35, 'B must be able to add progress';

  -- A correction may only undo B's OWN contribution (5), never A's 30.
  r := public.add_shared_goal_entry('00000000-0000-0000-0000-0000000000a3', -10);
  assert (r->>'applied')::float8 = -5, 'a negative entry must be capped at the caller''s own contributions';
  r := public.add_shared_goal_entry('00000000-0000-0000-0000-0000000000a3', -1);
  assert r->>'error' = 'ERK_CORRECTION_LIMIT', 'nothing of B''s left to undo';

  r := public.add_shared_goal_entry('00000000-0000-0000-0000-0000000000a3', 'NaN'::float8);
  assert r->>'error' = 'ERK_INVALID_AMOUNT', 'NaN must be rejected';
  r := public.add_shared_goal_entry('00000000-0000-0000-0000-0000000000a4', 1);
  assert r->>'error' = 'ERK_INVALID_AMOUNT', 'a milestone goal takes no amounts';

  r := public.add_shared_goal_entry('00000000-0000-0000-0000-0000000000a3', 2);
  d := public.get_shared_goal_detail('00000000-0000-0000-0000-0000000000a3');
  assert (d->'goal'->>'current_value')::float8 = 32, 'detail must carry the fresh total';
  assert (select count(*) from jsonb_array_elements(d->'entries') e
          where e->>'added_by' = '00000000-0000-0000-0000-00000000000b') = 3,
    'B''s entries must be attributed to B';
  assert (select count(*) from jsonb_array_elements(d->'entries') e
          where e->>'added_by' = '00000000-0000-0000-0000-00000000000a' and e->>'added_by_name' = 'Test A') = 1,
    'the owner''s own entries must be resolved to the owner';

  begin
    insert into public.goal_shares (goal_id, owner_id, shared_with_id)
    values ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a',
            '00000000-0000-0000-0000-00000000000c');
    assert false, 'direct insert into goal_shares must be blocked';
  exception when others then
    null;
  end;
end $$;

-- ------------------------------------------- postgres: plant an expired code
reset role;
insert into public.friend_invites (code, inviter_id, expires_at)
values ('EXPRD234', '00000000-0000-0000-0000-00000000000a', now() - interval '1 minute');

-- ---------------------------------------------------------------- C: stranger
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);

do $$
declare r jsonb; n int;
begin
  select count(*) into n from public.connections;
  assert n = 0, 'C must not see the A-B connection';
  select count(*) into n from public.habit_shares;
  assert n = 0, 'C must not see the A-B share';
  select count(*) into n from public.tasks;
  assert n = 0, 'C must not see any of A''s tasks';
  r := public.toggle_shared_task('00000000-0000-0000-0000-0000000000a5', true);
  assert r->>'error' = 'ERK_NOT_SHARED', 'a stranger must not toggle A''s task';

  select count(*) into n from public.goal_shares;
  assert n = 0, 'C must not see the A-B goal shares';
  select count(*) into n from public.get_shared_goals();
  assert n = 0, 'C must see no shared goals';
  r := public.add_shared_goal_entry('00000000-0000-0000-0000-0000000000a3', 1000);
  assert r->>'error' = 'ERK_NOT_SHARED', 'a stranger must not add progress to A''s goal';
  begin
    perform public.get_shared_goal_detail('00000000-0000-0000-0000-0000000000a3');
    assert false, 'a stranger must not read a shared goal';
  exception when others then
    assert sqlerrm = 'ERK_NOT_SHARED', 'stranger must get ERK_NOT_SHARED for goals';
  end;

  begin
    perform public.get_shared_habit_logs('00000000-0000-0000-0000-0000000000a1');
    assert false, 'a stranger must not read shared logs';
  exception when others then
    assert sqlerrm = 'ERK_NOT_SHARED', 'stranger must get ERK_NOT_SHARED';
  end;

  r := public.redeem_invite('EXPRD234');
  assert r->>'error' = 'ERK_INVITE_INVALID', 'expired code must look exactly like a missing one';

  -- 1 failure above + 9 more = 10 failures within the hour.
  for i in 1..9 loop
    r := public.redeem_invite('ZZZZZZZ' || i);
    assert r->>'error' = 'ERK_INVITE_INVALID', 'wrong code must be invalid';
  end loop;
  r := public.redeem_invite('ZZZZZZZZ');
  assert r->>'error' = 'ERK_RATE_LIMITED', '11th attempt within an hour must be rate limited';

  select count(*) into n from public.invite_redeem_attempts;
  assert n = 0, 'attempt log must not be readable by clients';
end $$;

-- ---------------------------------------------------------------- B: unfriend
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

do $$
declare n int; r jsonb;
begin
  perform public.remove_connection('00000000-0000-0000-0000-00000000000a');
  assert not public.are_connected('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'),
    'remove_connection must delete the friendship';
  select count(*) into n from public.habit_shares;
  assert n = 0, 'remove_connection must revoke habit shares in the same transaction';
  select count(*) into n from public.get_shared_habits();
  assert n = 0, 'nothing may stay visible after unfriending';
  select count(*) into n from public.tasks where user_id = '00000000-0000-0000-0000-00000000000a';
  assert n = 0, 'the shared task must disappear from B''s view after unfriending';
  select count(*) into n from public.goal_shares;
  assert n = 0, 'remove_connection must revoke goal shares in the same transaction';
  select count(*) into n from public.get_shared_goals();
  assert n = 0, 'no shared goal may stay visible after unfriending';
  r := public.add_shared_goal_entry('00000000-0000-0000-0000-0000000000a3', 1);
  assert r->>'error' = 'ERK_NOT_SHARED', 'no contributing after unfriending';
end $$;

-- As postgres: the owner's row itself keeps existing, with the share cleared.
reset role;
do $$ begin
  assert (select shared_with_id from public.tasks where id = '00000000-0000-0000-0000-0000000000a5') is null,
    'remove_connection must clear the task share';
  assert (select count(*) from public.goal_entries
          where goal_id = '00000000-0000-0000-0000-0000000000a3'
            and added_by = '00000000-0000-0000-0000-00000000000b') = 3,
    'B''s past contributions must stay in A''s goal history after unfriending';
  assert public.goal_current_value('00000000-0000-0000-0000-0000000000a3') = 32,
    'the goal total must not change when a friendship ends';
end $$;

select 'ALL SHARING CHECKS PASSED' as result;
rollback;
