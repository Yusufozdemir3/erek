-- Security checks for FRIENDS / SHARING — PHASE 5 (nudges) in supabase/schema.sql.
-- Run in the Supabase SQL Editor AFTER schema.sql. Everything happens inside
-- one transaction that is ROLLED BACK at the end: the test users and all their
-- rows disappear; nothing is left behind in the project.
-- A failing check aborts the script with "assert failed: <message>".
-- Users are impersonated the same way PostgREST does it (role + JWT `sub`);
-- the send-nudge Edge Function's calls run as `service_role`.
--
-- Cast: A = owner of the shared items, B = A's friend (can see them),
--       C = stranger.

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@nudge-test.local', '{"full_name":"Test A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@nudge-test.local', '{"full_name":"Bora Test"}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@nudge-test.local', '{"full_name":"Test C"}');

insert into public.habits (id, user_id, title, updated_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'A run', now()),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'A read', now()),
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-00000000000a', 'A stretch', now()),
  ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-00000000000a', 'A water', now()),
  ('00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-00000000000a', 'A walk', now());
insert into public.goals (id, user_id, title, goal_type, target_value, current_value, value_baseline, updated_at) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a', 'Run 100 km', 'numeric', 100, 0, 0, now());

-- Set up as postgres: A and B are friends, B sees A's items.
insert into public.connections (user_a, user_b)
values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
insert into public.habit_shares (habit_id, owner_id, shared_with_id)
select h, '00000000-0000-0000-0000-00000000000a'::uuid, '00000000-0000-0000-0000-00000000000b'::uuid
from unnest(array[
  '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2',
  '00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000a7',
  '00000000-0000-0000-0000-0000000000a8'
]::uuid[]) as h;
insert into public.goal_shares (goal_id, owner_id, shared_with_id) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');

-- ---------------------------------------------------------- A: device token
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
declare n int;
begin
  perform public.register_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'tr');
  select count(*) into n from public.push_tokens;
  assert n = 0, 'no client may read push tokens, not even its own';

  begin
    perform public.register_push_token('https://evil.example.com/hook', 'tr');
    assert false, 'a non-Expo token must be refused';
  exception when others then
    assert sqlerrm = 'ERK_INVALID_TOKEN', 'an invalid token must raise ERK_INVALID_TOKEN';
  end;

  begin
    insert into public.push_tokens (token, user_id)
    values ('ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]', '00000000-0000-0000-0000-00000000000b');
    assert false, 'direct insert into push_tokens must be blocked';
  exception when others then
    null; -- expected (RLS). OTHERS never swallows ASSERT_FAILURE, so the assert above still fails the run.
  end;

  begin
    perform public.prepare_nudge('00000000-0000-0000-0000-00000000000b', 'habit', '00000000-0000-0000-0000-0000000000a1');
    assert false, 'clients must not be able to call prepare_nudge';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- B registering the SAME token (same phone, B signed in) moves it to B.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$ begin
  perform public.register_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'en');
end $$;

reset role;
do $$ begin
  assert (select user_id from public.push_tokens where token = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]')
         = '00000000-0000-0000-0000-00000000000b',
    'registering a token under another account must move it';
  assert (select count(*) from public.push_tokens) = 1, 'a token is stored once';
end $$;

-- ... and back to A, who is the owner in the checks below.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$ begin
  perform public.register_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'tr');
end $$;

-- C: an unknown locale falls back to English; at most 10 devices per account.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
do $$ begin
  for i in 1..12 loop
    perform public.register_push_token('ExponentPushToken[' || lpad(i::text, 22, 'x') || ']', 'fr');
  end loop;
end $$;

reset role;
do $$ begin
  assert (select count(*) from public.push_tokens where user_id = '00000000-0000-0000-0000-00000000000c') = 10,
    'an account keeps at most 10 device tokens';
  assert not exists (select 1 from public.push_tokens
                     where user_id = '00000000-0000-0000-0000-00000000000c' and locale <> 'en'),
    'an unknown locale must be stored as en';
  delete from public.push_tokens where user_id = '00000000-0000-0000-0000-00000000000c';
end $$;

-- ------------------------------------------------- send-nudge (service role)
set local role service_role;
do $$
declare r jsonb;
begin
  r := public.prepare_nudge('00000000-0000-0000-0000-00000000000b', 'habit', '00000000-0000-0000-0000-0000000000a1');
  assert r->>'status' = 'ok', 'a friend nudging a shared habit must be ok, got ' || r::text;
  assert r->>'recipient' = '00000000-0000-0000-0000-00000000000a', 'the recipient must be the owner';
  assert r->>'sender_name' = 'Bora Test', 'the sender name comes from the profile';
  assert r->>'item_title' = 'A run', 'the item title comes back for the notification body, got ' || r::text;
  assert r->'tokens' = '[{"token":"ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]","locale":"tr"}]'::jsonb,
    'only the owner''s token, with its locale, got ' || (r->'tokens')::text;

  r := public.prepare_nudge('00000000-0000-0000-0000-00000000000b', 'habit', '00000000-0000-0000-0000-0000000000a1');
  assert r->>'status' = 'rate_limited_item', 'the same item twice within 12 h must be limited';

  r := public.prepare_nudge('00000000-0000-0000-0000-00000000000b', 'goal', '00000000-0000-0000-0000-0000000000a3');
  assert r->>'status' = 'ok', 'a shared goal can be nudged too';
  assert r->>'item_title' = 'Run 100 km', 'a goal nudge carries the goal title, got ' || r::text;

  r := public.prepare_nudge('00000000-0000-0000-0000-00000000000c', 'habit', '00000000-0000-0000-0000-0000000000a2');
  assert r->>'status' = 'forbidden', 'a stranger must not nudge';
  r := public.prepare_nudge('00000000-0000-0000-0000-00000000000a', 'habit', '00000000-0000-0000-0000-0000000000a2');
  assert r->>'status' = 'forbidden', 'the owner is not a recipient of their own share';
  r := public.prepare_nudge('00000000-0000-0000-0000-00000000000b', 'goal', '00000000-0000-0000-0000-0000000000a2');
  assert r->>'status' = 'forbidden', 'the kind must match the share';
  r := public.prepare_nudge('00000000-0000-0000-0000-00000000000b', 'task', '00000000-0000-0000-0000-0000000000a2');
  assert r->>'status' = 'forbidden', 'unknown kinds are refused';
  r := public.prepare_nudge('00000000-0000-0000-0000-00000000000b', 'habit', null);
  assert r->>'status' = 'forbidden', 'a missing item is refused';
end $$;

-- ------------------------------------------------------------ A: mute B
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$
declare p jsonb;
begin
  perform public.set_nudge_mute('00000000-0000-0000-0000-00000000000b', true);
  perform public.set_nudge_mute('00000000-0000-0000-0000-00000000000c', true); -- not a friend: ignored
  p := public.get_nudge_prefs();
  assert p->>'enabled' = 'true', 'nudges are on by default';
  assert p->'muted' = '["00000000-0000-0000-0000-00000000000b"]'::jsonb, 'only the friend is muted, got ' || p::text;
end $$;

-- B can't find out it was muted, nor read anyone's history.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.nudge_mutes;
  assert n = 0, 'mutes must not be readable directly';
  select count(*) into n from public.nudges;
  assert n = 0, 'nudge history must not be readable by clients';
  assert (public.get_nudge_prefs())->'muted' = '[]'::jsonb, 'B''s own prefs must not reveal A''s mute';
end $$;

reset role;
set local role service_role;
do $$
declare r jsonb;
begin
  r := public.prepare_nudge('00000000-0000-0000-0000-00000000000b', 'habit', '00000000-0000-0000-0000-0000000000a2');
  assert r->>'status' = 'muted', 'a muted friend''s nudge must not be delivered, got ' || r::text;
  assert r->'tokens' is null, 'no token may leave for a muted nudge';
end $$;

-- A unmutes B but switches nudges off altogether.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$ begin
  perform public.set_nudge_mute('00000000-0000-0000-0000-00000000000b', false);
  perform public.set_nudges_enabled(false);
  assert (public.get_nudge_prefs())->>'enabled' = 'false', 'the opt-out must be stored';
  assert (public.get_nudge_prefs())->'muted' = '[]'::jsonb, 'unmute must remove the row';
end $$;

reset role;
set local role service_role;
do $$
declare r jsonb;
begin
  r := public.prepare_nudge('00000000-0000-0000-0000-00000000000b', 'habit', '00000000-0000-0000-0000-0000000000a6');
  assert r->>'status' = 'muted', 'opted out: nothing is delivered';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$ begin
  perform public.set_nudges_enabled(true);
end $$;

-- ------------------------------------- anon: release after offline sign-out
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin
    perform public.register_push_token('ExponentPushToken[cccccccccccccccccccccc]', 'tr');
    assert false, 'anon must not register tokens';
  exception when insufficient_privilege then
    null;
  end;
  perform public.release_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]');
end $$;

reset role;
do $$ begin
  assert (select count(*) from public.push_tokens) = 0, 'release must work without a session';
end $$;

set local role service_role;
do $$
declare r jsonb;
begin
  r := public.prepare_nudge('00000000-0000-0000-0000-00000000000b', 'habit', '00000000-0000-0000-0000-0000000000a7');
  assert r->>'status' = 'no_device', 'without a registered device: no_device, got ' || r::text;
end $$;

-- ------------------------------------------------------------ daily limits
reset role;
insert into public.nudges (sender_id, recipient_id, item_kind, item_id, created_at)
select '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 'habit', gen_random_uuid(),
       now() - interval '1 hour'
from generate_series(1, 20);

set local role service_role;
do $$
declare r jsonb;
begin
  r := public.prepare_nudge('00000000-0000-0000-0000-00000000000b', 'habit', '00000000-0000-0000-0000-0000000000a8');
  assert r->>'status' = 'rate_limited', 'more than 20 a day per sender must be limited, got ' || r::text;
end $$;

reset role;
delete from public.nudges;
insert into public.nudges (sender_id, recipient_id, item_kind, item_id, created_at)
select '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'habit', gen_random_uuid(),
       now() - interval '1 hour'
from generate_series(1, 30);

set local role service_role;
do $$
declare r jsonb;
begin
  r := public.prepare_nudge('00000000-0000-0000-0000-00000000000b', 'habit', '00000000-0000-0000-0000-0000000000a8');
  assert r->>'status' = 'rate_limited', 'more than 30 a day per recipient must be limited, got ' || r::text;
end $$;

-- Old history no longer counts, and is pruned.
reset role;
update public.nudges set created_at = now() - interval '31 days';

set local role service_role;
do $$
declare r jsonb;
begin
  r := public.prepare_nudge('00000000-0000-0000-0000-00000000000b', 'habit', '00000000-0000-0000-0000-0000000000a8');
  assert r->>'status' = 'no_device', 'limits only look at the last day, got ' || r::text;
end $$;

reset role;
do $$ begin
  assert not exists (select 1 from public.nudges where created_at < now() - interval '30 days'),
    'history older than 30 days must be pruned';
end $$;

-- ------------------------------------------------------------ B: unfriend
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$ begin
  perform public.remove_connection('00000000-0000-0000-0000-00000000000a');
end $$;

reset role;
set local role service_role;
do $$
declare r jsonb;
begin
  r := public.prepare_nudge('00000000-0000-0000-0000-00000000000b', 'goal', '00000000-0000-0000-0000-0000000000a3');
  assert r->>'status' = 'forbidden', 'after unfriending nothing may be nudged, got ' || r::text;
end $$;

-- ------------------------------------------------------ A: delete account
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$ begin
  perform public.register_push_token('ExponentPushToken[dddddddddddddddddddddd]', 'de');
end $$;

reset role;
insert into public.nudge_mutes (muter_id, muted_id)
values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c');

set local role authenticated;
do $$ begin
  perform public.delete_account();
end $$;

reset role;
do $$ begin
  assert not exists (select 1 from public.push_tokens), 'deleting the account must delete its push tokens';
  assert not exists (select 1 from public.nudges
                     where sender_id = '00000000-0000-0000-0000-00000000000a'
                        or recipient_id = '00000000-0000-0000-0000-00000000000a'),
    'deleting the account must delete its nudge history';
  assert not exists (select 1 from public.nudge_mutes), 'deleting the account must delete its mutes';
end $$;

select 'ALL NUDGE CHECKS PASSED' as result;
rollback;
