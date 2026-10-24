-- Phase 7b: a shared numeric goal can be congratulated once its total reaches the
-- target, even if the owner's app never synced completed_at (friends'
-- contributions can finish it). Run once in the Supabase SQL editor.

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
