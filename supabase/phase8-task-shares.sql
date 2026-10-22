-- =============================================================================
-- FRIENDS / SHARING — PHASE 8: shopping-list tasks (many people, one task)
-- =============================================================================
-- A task can now be shared with SEVERAL friends (up to 10), and the people it
-- is shared with can tick, ADD and REMOVE its subtasks — like a shopping list.
-- Run this block before shipping the client that sends `shared_with_ids`.
--
-- Shape:
--   - task_shares (task_id, owner_id, shared_with_id) is the source of truth
--     for "who can see this task", written ONLY by triggers from the owner's
--     task row (no write policies, no client RPC).
--   - The owner's device keeps the list on the task row itself
--     (tasks.shared_with_ids = JSON array of uids), so it syncs offline like any
--     other column. tasks.shared_with_id stays as "the first one": older app
--     versions only know that column and keep working with a single friend.
--   - Triggers on the push path NEVER raise (a raise would wedge the owner's
--     sync on that row): invalid targets are dropped and the correction bumps
--     updated_at so every device adopts it via last-writer-wins.
--   - Recipients' writes: toggle_shared_task / toggle_shared_subtask (tick),
--     add_shared_subtask, delete_shared_subtask. Titles of the task itself
--     and everything else stay owner-only.
--   - subtasks.completed_by: who ticked an item. Decided here, never trusted
--     from a client push (server-authoritative).

create table if not exists public.task_shares (
  task_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  shared_with_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, shared_with_id)
);
create index if not exists idx_task_shares_recipient on public.task_shares(shared_with_id);
create index if not exists idx_task_shares_owner on public.task_shares(owner_id);

alter table public.task_shares enable row level security;
drop policy if exists "task_shares member read" on public.task_shares;
create policy "task_shares member read" on public.task_shares
  for select using ((select auth.uid()) in (owner_id, shared_with_id));
-- No write policies: tasks_sync_shares() is the only writer.

alter table public.tasks add column if not exists shared_with_ids text;
alter table public.subtasks add column if not exists completed_by uuid;

-- JSON text -> distinct uuids in order; garbage in, fewer (or no) uuids out.
create or replace function public.task_share_ids(p_json text)
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_out uuid[] := '{}';
  v_item text;
  v_uid uuid;
begin
  if p_json is null or p_json = '' then
    return v_out;
  end if;
  begin
    for v_item in select jsonb_array_elements_text(p_json::jsonb) loop
      begin
        v_uid := v_item::uuid;
        if not (v_uid = any(v_out)) then
          v_out := v_out || v_uid;
        end if;
      exception when others then
        null;
      end;
    end loop;
  exception when others then
    return v_out;
  end;
  return v_out;
end;
$$;

-- Existing single shares become task_shares rows.
update public.tasks t
set shared_with_ids = jsonb_build_array(t.shared_with_id::text)::text
where t.shared_with_id is not null and t.recurrence is null and t.shared_with_ids is null;

insert into public.task_shares (task_id, owner_id, shared_with_id)
select t.id, t.user_id, t.shared_with_id
from public.tasks t
where t.shared_with_id is not null and t.recurrence is null and t.deleted_at is null
on conflict do nothing;

-- BEFORE insert/update on tasks: lost-update guard + target normalisation.
create or replace function public.tasks_sharing_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_ok uuid[] := '{}';
  v_u uuid;
  v_old_targets uuid[] := '{}';
  v_json text;
begin
  -- 1) Lost-update guard, only on shared tasks: an owner's OFFLINE edit made
  --    before a friend's check-off must not undo that check-off. Other columns
  --    (title, date...) still go through; completion keeps the newer value.
  if tg_op = 'UPDATE' then
    v_old_targets := public.task_share_ids(old.shared_with_ids);
    if cardinality(v_old_targets) = 0 and old.shared_with_id is not null then
      v_old_targets := array[old.shared_with_id];
    end if;
    if cardinality(v_old_targets) > 0 and new.updated_at < old.updated_at then
      new.completed_at := old.completed_at;
      new.updated_at := old.updated_at;
    end if;
  end if;

  -- 2) Who is it shared with? The list column wins. An OLDER client only
  --    knows shared_with_id: when the owner changes just that column, it means
  --    "this one friend" (or nobody). Cascades (a friend deleting their
  --    account nulls shared_with_id) run as someone else and are ignored here.
  v_ids := public.task_share_ids(new.shared_with_ids);
  if tg_op = 'INSERT' then
    if cardinality(v_ids) = 0 and new.shared_with_id is not null then
      v_ids := array[new.shared_with_id];
    end if;
  elsif new.shared_with_id is distinct from old.shared_with_id
        and new.shared_with_ids is not distinct from old.shared_with_ids
        and auth.uid() is not distinct from new.user_id then
    v_ids := case when new.shared_with_id is null then '{}'::uuid[] else array[new.shared_with_id] end;
  end if;

  -- 3) Only connected friends, never yourself, at most 10, never on a
  --    recurring task (recurrence is computed client-side).
  if new.recurrence is null then
    foreach v_u in array v_ids loop
      exit when cardinality(v_ok) >= 10;
      if v_u <> new.user_id and public.are_connected(new.user_id, v_u) then
        v_ok := v_ok || v_u;
      end if;
    end loop;
  end if;

  if v_ok is distinct from public.task_share_ids(new.shared_with_ids)
     or new.shared_with_id is distinct from v_ok[1] then
    if cardinality(v_ok) = 0 then
      v_json := null;
    else
      select jsonb_agg(u.x::text order by u.n)::text into v_json
      from unnest(v_ok) with ordinality as u(x, n);
    end if;
    new.shared_with_ids := v_json;
    new.shared_with_id := v_ok[1];
    new.updated_at := greatest(new.updated_at, now());
  end if;

  -- 4) A change of recipients WITHOUT a newer client timestamp (a friend
  --    deleting their account): make it win on the owner's devices.
  if tg_op = 'UPDATE' and v_ok is distinct from v_old_targets and new.updated_at <= old.updated_at then
    new.updated_at := now();
  end if;

  return new;
end;
$$;
revoke all on function public.tasks_sharing_guard() from public, anon, authenticated;

-- AFTER insert/update on tasks: task_shares follows the (validated) list.
-- Subtasks that existed before someone was added are touched so the new
-- recipient's incremental pull receives them (updated_at stays as it is, only
-- the server timestamp moves).
create or replace function public.tasks_sync_shares()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_added integer;
begin
  if tg_op = 'INSERT' and new.shared_with_ids is null and new.shared_with_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and new.shared_with_ids is not distinct from old.shared_with_ids
     and new.shared_with_id is not distinct from old.shared_with_id
     and new.deleted_at is not distinct from old.deleted_at
     and new.recurrence is not distinct from old.recurrence then
    return null;
  end if;

  v_ids := case when new.deleted_at is null and new.recurrence is null
                then public.task_share_ids(new.shared_with_ids) else '{}'::uuid[] end;

  delete from public.task_shares s
  where s.task_id = new.id and not (s.shared_with_id = any(v_ids));

  -- Only users that still exist: when a recipient deletes their account the FK
  -- actions (task_shares cascade, tasks.shared_with_id set null) run in no
  -- guaranteed order, and re-inserting a row for the vanishing user would fail
  -- the whole account deletion.
  insert into public.task_shares (task_id, owner_id, shared_with_id)
  select new.id, new.user_id, x from unnest(v_ids) as x
  where exists (select 1 from auth.users u where u.id = x)
  on conflict do nothing;
  get diagnostics v_added = row_count;

  if v_added > 0 then
    update public.subtasks s set updated_at = s.updated_at where s.task_id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function public.tasks_sync_shares() from public, anon, authenticated;

drop trigger if exists trg_tasks_share_touch_subtasks on public.tasks;
drop function if exists public.tasks_share_touch_subtasks();
drop trigger if exists trg_tasks_sync_shares on public.tasks;
create trigger trg_tasks_sync_shares
  after insert or update on public.tasks
  for each row execute function public.tasks_sync_shares();

-- Tasks and subtasks shared WITH me: membership in task_shares.
-- The ids are fetched ONCE per query as an array (an InitPlan), so the planner
-- keeps answering "user_id = me OR id = ANY(shared with me)" with index scans /
-- a BitmapOr. A per-row EXISTS here would turn every sync pull into a filter
-- over the whole tasks table.
create or replace function public.my_shared_task_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(s.task_id), '{}'::uuid[])
  from public.task_shares s
  where s.shared_with_id = (select auth.uid())
$$;
revoke all on function public.my_shared_task_ids() from public, anon;
grant execute on function public.my_shared_task_ids() to authenticated;

drop policy if exists "tasks select" on public.tasks;
create policy "tasks select" on public.tasks for select
  using (
    user_id = (select auth.uid())
    or (
      id = any((select public.my_shared_task_ids())::uuid[])
      and (select public.client_supports_sharing())
    )
  );

drop policy if exists "subtasks select" on public.subtasks;
create policy "subtasks select" on public.subtasks for select
  using (
    exists (
      select 1 from public.tasks t
      where t.id = subtasks.task_id and t.user_id = (select auth.uid())
    )
    or (
      task_id = any((select public.my_shared_task_ids())::uuid[])
      and (select public.client_supports_sharing())
    )
  );

-- Subtasks: lost-update guard (as before) + completed_by bookkeeping. Whoever
-- flips `completed` is recorded; a push that doesn't change it keeps the old value.
create or replace function public.subtasks_sharing_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shared boolean;
begin
  v_shared := exists (select 1 from public.task_shares s where s.task_id = new.task_id);
  if v_shared and new.updated_at < old.updated_at then
    new.completed := old.completed;
    new.completed_by := old.completed_by;
    new.updated_at := old.updated_at;
  elsif new.completed is distinct from old.completed then
    new.completed_by := case when new.completed = 1 and v_shared then auth.uid() else null end;
  else
    new.completed_by := old.completed_by;
  end if;
  return new;
end;
$$;
revoke all on function public.subtasks_sharing_guard() from public, anon, authenticated;

-- A recipient ticking a whole task (no subtasks).
create or replace function public.toggle_shared_task(p_task_id uuid, p_completed boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_completed_at text;
  v_updated_at timestamptz;
begin
  if v_uid is null then
    raise exception using message = 'ERK_AUTH';
  end if;
  update public.tasks t
  set completed_at = case
        when p_completed then to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        else null
      end,
      -- Strictly newer than the current row even if the owner's device clock
      -- runs ahead of the server, so the lost-update guard never eats this toggle.
      updated_at = greatest(now(), t.updated_at + interval '1 millisecond')
  where t.id = p_task_id
    and exists (select 1 from public.task_shares sh where sh.task_id = t.id and sh.shared_with_id = v_uid)
    and t.deleted_at is null
    and t.recurrence is null
    and public.are_connected(t.user_id, v_uid)
  returning t.completed_at, t.updated_at into v_completed_at, v_updated_at;
  if not found then
    return jsonb_build_object('error', 'ERK_NOT_SHARED');
  end if;
  return jsonb_build_object('completed_at', v_completed_at, 'updated_at', v_updated_at);
end;
$$;
revoke all on function public.toggle_shared_task(uuid, boolean) from public, anon;
grant execute on function public.toggle_shared_task(uuid, boolean) to authenticated;

-- A recipient ticking one subtask. Returns the new state of the subtask AND of
-- its parent task (which may have completed/reopened with it).
create or replace function public.toggle_shared_subtask(p_subtask_id uuid, p_completed boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_task uuid;
  v_completed integer := case when coalesce(p_completed, false) then 1 else 0 end;
  v_sub_updated timestamptz;
  v_completed_by uuid;
  v_open integer;
  v_task_completed_at text;
  v_task_updated timestamptz;
begin
  if v_uid is null then
    raise exception using message = 'ERK_AUTH';
  end if;

  select s.task_id into v_task
  from public.subtasks s
  join public.tasks t on t.id = s.task_id
  where s.id = p_subtask_id
    and s.deleted_at is null
    and exists (select 1 from public.task_shares sh where sh.task_id = t.id and sh.shared_with_id = v_uid)
    and t.deleted_at is null
    and t.recurrence is null
    and public.are_connected(t.user_id, v_uid)
  for update of s, t;
  if v_task is null then
    return jsonb_build_object('error', 'ERK_NOT_SHARED');
  end if;

  -- completed_by is decided by subtasks_sharing_guard(): whoever FLIPS the
  -- value is recorded, a repeated tick keeps the first person. Return what the
  -- row really holds so the caller's copy matches the cloud.
  update public.subtasks s
  set completed = v_completed,
      updated_at = greatest(now(), s.updated_at + interval '1 millisecond')
  where s.id = p_subtask_id
  returning s.updated_at, s.completed_by into v_sub_updated, v_completed_by;

  select count(*) filter (where s.completed = 0) into v_open
  from public.subtasks s
  where s.task_id = v_task and s.deleted_at is null;

  update public.tasks t
  set completed_at = case
        when v_open = 0 then to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        else null
      end,
      updated_at = greatest(now(), t.updated_at + interval '1 millisecond')
  where t.id = v_task
    and ((v_open = 0 and t.completed_at is null) or (v_open > 0 and t.completed_at is not null));

  select t.completed_at, t.updated_at into v_task_completed_at, v_task_updated
  from public.tasks t where t.id = v_task;

  return jsonb_build_object(
    'completed', v_completed,
    'completed_by', v_completed_by,
    'subtask_updated_at', v_sub_updated,
    'task_id', v_task,
    'task_completed_at', v_task_completed_at,
    'task_updated_at', v_task_updated
  );
end;
$$;
revoke all on function public.toggle_shared_subtask(uuid, boolean) from public, anon;
grant execute on function public.toggle_shared_subtask(uuid, boolean) to authenticated;

-- A recipient adds an item to the list. An item makes the task "not done" again.
create or replace function public.add_shared_subtask(p_task_id uuid, p_title text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_found uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_pos integer;
  v_id uuid := gen_random_uuid();
  v_sub_updated timestamptz;
  v_task_completed_at text;
  v_task_updated timestamptz;
begin
  if v_uid is null then
    raise exception using message = 'ERK_AUTH';
  end if;

  select t.id into v_found
  from public.tasks t
  where t.id = p_task_id
    and exists (select 1 from public.task_shares sh where sh.task_id = t.id and sh.shared_with_id = v_uid)
    and t.deleted_at is null
    and t.recurrence is null
    and public.are_connected(t.user_id, v_uid)
  for update of t;
  if v_found is null then
    return jsonb_build_object('error', 'ERK_NOT_SHARED');
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 120 then
    return jsonb_build_object('error', 'ERK_INVALID_TITLE');
  end if;
  if (select count(*) from public.subtasks s where s.task_id = p_task_id and s.deleted_at is null) >= 100 then
    return jsonb_build_object('error', 'ERK_LIST_FULL');
  end if;
  -- Tombstones count too, and add/remove loops are slowed down: a list is a
  -- list, not a message channel.
  if (select count(*) from public.subtasks s where s.task_id = p_task_id) >= 300
     or (select count(*) from public.subtasks s
         where s.task_id = p_task_id and s.deleted_at is not null
           and s.updated_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('error', 'ERK_LIST_BUSY');
  end if;

  select coalesce(max(s.position), -1) + 1 into v_pos
  from public.subtasks s where s.task_id = p_task_id;

  insert into public.subtasks (id, task_id, title, completed, position, updated_at, deleted_at)
  values (v_id, p_task_id, v_title, 0, v_pos, now(), null)
  returning updated_at into v_sub_updated;

  update public.tasks t
  set completed_at = null,
      updated_at = greatest(now(), t.updated_at + interval '1 millisecond')
  where t.id = p_task_id and t.completed_at is not null;

  select t.completed_at, t.updated_at into v_task_completed_at, v_task_updated
  from public.tasks t where t.id = p_task_id;

  return jsonb_build_object(
    'subtask_id', v_id,
    'title', v_title,
    'position', v_pos,
    'subtask_updated_at', v_sub_updated,
    'task_id', p_task_id,
    'task_completed_at', v_task_completed_at,
    'task_updated_at', v_task_updated
  );
end;
$$;
revoke all on function public.add_shared_subtask(uuid, text) from public, anon;
grant execute on function public.add_shared_subtask(uuid, text) to authenticated;

-- A recipient removes an item (soft delete, so every device adopts it).
-- The task completes when what is left is all done.
create or replace function public.delete_shared_subtask(p_subtask_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_task uuid;
  v_sub_updated timestamptz;
  v_open integer;
  v_total integer;
  v_task_completed_at text;
  v_task_updated timestamptz;
begin
  if v_uid is null then
    raise exception using message = 'ERK_AUTH';
  end if;

  select s.task_id into v_task
  from public.subtasks s
  join public.tasks t on t.id = s.task_id
  where s.id = p_subtask_id
    and s.deleted_at is null
    and exists (select 1 from public.task_shares sh where sh.task_id = t.id and sh.shared_with_id = v_uid)
    and t.deleted_at is null
    and t.recurrence is null
    and public.are_connected(t.user_id, v_uid)
  for update of s, t;
  if v_task is null then
    return jsonb_build_object('error', 'ERK_NOT_SHARED');
  end if;

  if (select count(*) from public.subtasks s
      where s.task_id = v_task and s.deleted_at is not null
        and s.updated_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('error', 'ERK_LIST_BUSY');
  end if;

  update public.subtasks s
  set deleted_at = now(),
      updated_at = greatest(now(), s.updated_at + interval '1 millisecond')
  where s.id = p_subtask_id
  returning s.updated_at into v_sub_updated;

  select count(*) filter (where s.completed = 0), count(*) into v_open, v_total
  from public.subtasks s
  where s.task_id = v_task and s.deleted_at is null;

  -- An emptied list keeps the task as it was.
  if v_total > 0 then
    update public.tasks t
    set completed_at = case
          when v_open = 0 then to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          else null
        end,
        updated_at = greatest(now(), t.updated_at + interval '1 millisecond')
    where t.id = v_task
      and ((v_open = 0 and t.completed_at is null) or (v_open > 0 and t.completed_at is not null));
  end if;

  select t.completed_at, t.updated_at into v_task_completed_at, v_task_updated
  from public.tasks t where t.id = v_task;

  return jsonb_build_object(
    'subtask_updated_at', v_sub_updated,
    'task_id', v_task,
    'task_completed_at', v_task_completed_at,
    'task_updated_at', v_task_updated
  );
end;
$$;
revoke all on function public.delete_shared_subtask(uuid) from public, anon;
grant execute on function public.delete_shared_subtask(uuid) to authenticated;

-- Names for "who ticked it": the owner and everyone the task is shared with,
-- for anyone who is in on it. Participants need not be friends of each other.
create or replace function public.get_task_participants(p_task_id uuid)
returns table (user_id uuid, display_name text, is_owner boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select u.uid, p.display_name, u.owner
  from (
    select t.user_id as uid, true as owner
    from public.tasks t
    where t.id = p_task_id and t.deleted_at is null
    union all
    select s.shared_with_id, false
    from public.task_shares s
    where s.task_id = p_task_id
  ) u
  left join public.profiles p on p.id = u.uid
  where exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and (
        t.user_id = (select auth.uid())
        or exists (
          select 1 from public.task_shares s2
          where s2.task_id = p_task_id and s2.shared_with_id = (select auth.uid())
        )
      )
  )
$$;
revoke all on function public.get_task_participants(uuid) from public, anon;
grant execute on function public.get_task_participants(uuid) to authenticated;

-- Removes a friendship AND, in the same transaction, everything the two share
-- with each other — no half-revoked state is possible.
create or replace function public.remove_connection(p_friend uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using message = 'ERK_AUTH';
  end if;
  delete from public.connections c
  where c.user_a = least(v_uid, p_friend) and c.user_b = greatest(v_uid, p_friend);
  delete from public.habit_shares s
  where (s.owner_id = v_uid and s.shared_with_id = p_friend)
     or (s.owner_id = p_friend and s.shared_with_id = v_uid);
  -- Entries a friend already contributed to a shared goal STAY: they're part
  -- of that goal's history. Only the ability to see/contribute ends.
  delete from public.goal_shares s
  where (s.owner_id = v_uid and s.shared_with_id = p_friend)
     or (s.owner_id = p_friend and s.shared_with_id = v_uid);
  delete from public.task_shares s
  where (s.owner_id = v_uid and s.shared_with_id = p_friend)
     or (s.owner_id = p_friend and s.shared_with_id = v_uid);
  -- Touch the affected tasks: with the connection gone, tasks_sharing_guard()
  -- drops the ex-friend from the list and bumps updated_at, so the owner's
  -- devices adopt it via LWW and the friend's device drops the task in its
  -- post-pull reconciliation. Other recipients keep the task.
  update public.tasks t
  set updated_at = greatest(now(), t.updated_at + interval '1 millisecond')
  where (t.user_id = v_uid and (t.shared_with_id = p_friend or t.shared_with_ids like '%' || p_friend::text || '%'))
     or (t.user_id = p_friend and (t.shared_with_id = v_uid or t.shared_with_ids like '%' || v_uid::text || '%'));
end;
$$;
revoke all on function public.remove_connection(uuid) from public, anon;
grant execute on function public.remove_connection(uuid) to authenticated;

-- Congratulating a finished shared task: the sender must be one of its recipients.
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
    else exists (select 1 from public.task_shares s where s.task_id = p_item_id and s.owner_id = v_owner and s.shared_with_id = p_sender)
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
