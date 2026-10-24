
-- =============================================================================
-- FRIENDS / SHARING — PHASE 7: finished items and congratulations
-- =============================================================================
-- When an owner FINISHES a shared goal (completed) or habit (end date passed),
-- the people it is shared with get a push, and anyone who can see a finished
-- shared goal / habit / task can congratulate the owner (a push back to them).
-- Finished TASKS never notify anyone, but can still be congratulated.
--
-- Same model as PHASE 5: pushes only go out of the send-nudge Edge Function
-- (service role) after prepare_finished() / prepare_congrats() checked the share,
-- the friendship, that the item is REALLY finished on the server, mutes and the
-- global opt-out ("nudges_enabled"), and recorded it so it happens ONCE.
-- Run this block before deploying the updated send-nudge function.

create table if not exists public.celebrations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('finished', 'congrats')),
  item_kind text not null check (item_kind in ('habit', 'goal', 'task')),
  item_id uuid not null,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (type, item_kind, item_id, sender_id, recipient_id)
);
create index if not exists idx_celebrations_sender on public.celebrations(sender_id, created_at);
alter table public.celebrations enable row level security;
-- No policies: only the two functions below touch it.

-- Is this item finished, as far as the SERVER knows (the owner's app syncs
-- before it asks)? Returns the owner and title, no row when not finished.
create or replace function public.finished_item(p_kind text, p_item_id uuid)
returns table (owner_id uuid, title text)
language sql
stable
security definer
set search_path = ''
as $$
  select g.user_id, g.title from public.goals g
  where p_kind = 'goal' and g.id = p_item_id and g.deleted_at is null
    -- A numeric goal counts as finished once its total (friends' contributions
    -- included) reaches the target: the owner's app may not have synced completed_at.
    and ((g.goal_type <> 'numeric' and g.completed_at is not null)
      or (g.goal_type = 'numeric' and g.target_value > 0
          and public.goal_current_value(g.id) >= g.target_value))
  union all
  select h.user_id, h.title from public.habits h
  where p_kind = 'habit' and h.id = p_item_id and h.deleted_at is null
    and h.end_date is not null
    and h.end_date < to_char(now() at time zone 'utc', 'YYYY-MM-DD')
  union all
  select t.user_id, t.title from public.tasks t
  where p_kind = 'task' and t.id = p_item_id and t.deleted_at is null
    and t.completed_at is not null
$$;
revoke all on function public.finished_item(text, uuid) from public, anon, authenticated;
grant execute on function public.finished_item(text, uuid) to service_role;

-- The owner finished a shared goal/habit: who should hear about it? Records one
-- row per recipient (so it is announced once) and returns their device tokens.
create or replace function public.prepare_finished(p_owner uuid, p_kind text, p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_real_owner uuid;
  v_out jsonb;
begin
  if p_owner is null or p_item_id is null or p_kind is null or p_kind not in ('habit', 'goal') then
    return jsonb_build_object('status', 'forbidden');
  end if;
  select f.owner_id, f.title into v_real_owner, v_title from public.finished_item(p_kind, p_item_id) f;
  if v_real_owner is distinct from p_owner then
    return jsonb_build_object('status', 'not_finished');
  end if;

  with sharees as (
    select s.shared_with_id as uid from public.habit_shares s
      where p_kind = 'habit' and s.habit_id = p_item_id and s.owner_id = p_owner
    union
    select s.shared_with_id from public.goal_shares s
      where p_kind = 'goal' and s.goal_id = p_item_id and s.owner_id = p_owner
  ),
  eligible as (
    select sh.uid from sharees sh
    where public.are_connected(p_owner, sh.uid)
      and coalesce((select p.nudges_enabled from public.profiles p where p.id = sh.uid), true)
      and not exists (select 1 from public.nudge_mutes m where m.muter_id = sh.uid and m.muted_id = p_owner)
  ),
  fresh as (
    insert into public.celebrations (type, item_kind, item_id, sender_id, recipient_id)
    select 'finished', p_kind, p_item_id, p_owner, e.uid from eligible e
    on conflict do nothing
    returning recipient_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'recipient', f.recipient_id,
           'tokens', (select coalesce(jsonb_agg(jsonb_build_object('token', t.token, 'locale', t.locale)), '[]'::jsonb)
                      from public.push_tokens t where t.user_id = f.recipient_id)
         )), '[]'::jsonb)
  into v_out
  from fresh f;

  if jsonb_array_length(v_out) = 0 then
    return jsonb_build_object('status', 'nobody');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'sender_name', (select p.display_name from public.profiles p where p.id = p_owner),
    'item_title', v_title,
    'recipients', v_out
  );
end;
$$;
revoke all on function public.prepare_finished(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.prepare_finished(uuid, text, uuid) to service_role;

-- A friend congratulates the owner of a finished shared item (goal, habit or
-- task). Once per friend per item; muted / switched-off owners get nothing but
-- the friend is told it was sent (so muting can't be probed).
create or replace function public.prepare_congrats(p_sender uuid, p_kind text, p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_title text;
  v_tokens jsonb;
  v_shared boolean;
begin
  if p_sender is null or p_item_id is null or p_kind is null or p_kind not in ('habit', 'goal', 'task') then
    return jsonb_build_object('status', 'forbidden');
  end if;
  select f.owner_id, f.title into v_owner, v_title from public.finished_item(p_kind, p_item_id) f;
  if v_owner is null then
    return jsonb_build_object('status', 'not_finished');
  end if;
  v_shared := case p_kind
    when 'habit' then exists (select 1 from public.habit_shares s where s.habit_id = p_item_id and s.owner_id = v_owner and s.shared_with_id = p_sender)
    when 'goal' then exists (select 1 from public.goal_shares s where s.goal_id = p_item_id and s.owner_id = v_owner and s.shared_with_id = p_sender)
    else exists (select 1 from public.tasks t where t.id = p_item_id and t.user_id = v_owner and t.shared_with_id = p_sender)
  end;
  if not v_shared or not public.are_connected(v_owner, p_sender) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  -- 20 congratulations per sender per day is plenty.
  if (select count(*) from public.celebrations c
      where c.sender_id = p_sender and c.type = 'congrats' and c.created_at > now() - interval '24 hours') >= 20 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into public.celebrations (type, item_kind, item_id, sender_id, recipient_id)
  values ('congrats', p_kind, p_item_id, p_sender, v_owner)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('status', 'already');
  end if;

  if exists (select 1 from public.nudge_mutes m where m.muter_id = v_owner and m.muted_id = p_sender)
     or not coalesce((select p.nudges_enabled from public.profiles p where p.id = v_owner), true) then
    return jsonb_build_object('status', 'muted');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('token', t.token, 'locale', t.locale)), '[]'::jsonb)
  into v_tokens from public.push_tokens t where t.user_id = v_owner;
  if jsonb_array_length(v_tokens) = 0 then
    return jsonb_build_object('status', 'no_device');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'recipient', v_owner,
    'sender_name', (select p.display_name from public.profiles p where p.id = p_sender),
    'item_title', v_title,
    'tokens', v_tokens
  );
end;
$$;
revoke all on function public.prepare_congrats(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.prepare_congrats(uuid, text, uuid) to service_role;
