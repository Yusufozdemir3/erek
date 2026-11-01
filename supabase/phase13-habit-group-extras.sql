-- Erek — Faz 13: Ortak alışkanlık eklemeleri
-- Supabase panelinde: SQL Editor > New query > bu dosyayı yapıştır > Run.
-- Yeniden çalıştırılabilir. Faz 12'den SONRA, istemciden ÖNCE çalıştırılır.
--   * habit_shares.together: paylaşım "Sadece görsünler" (false) ya da
--     "Birlikte yapalım" (true). Eski paylaşımlar true kalır (önceki davranış).
--   * Katılım yalnız together=true ise (ERK_NOT_TOGETHER).
--   * Grup arkadaşları birbirine hatırlatma (dürtme) gönderebilir: prepare_nudge
--     paylaşım yoksa grup üyeliğine bakar. Edge Function değişmez.

alter table public.habit_shares add column if not exists together boolean not null default true;

-- Sahibi, alışkanlığın tüm paylaşımlarının modunu değiştirir.
create or replace function public.set_habit_share_mode(p_habit_id uuid, p_together boolean)
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
  update public.habit_shares s
  set together = coalesce(p_together, true)
  where s.habit_id = p_habit_id and s.owner_id = v_uid;
end;
$$;
revoke all on function public.set_habit_share_mode(uuid, boolean) from public, anon;
grant execute on function public.set_habit_share_mode(uuid, boolean) to authenticated;

drop function if exists public.get_shared_habits();
-- Habits shared with the caller. The share row's owner must still own the
-- habit and still be connected (defense in depth on top of remove_connection).
create or replace function public.get_shared_habits()
returns table (
  id uuid, title text, kind text, icon text, color text, schedule text,
  target_amount double precision, unit text, start_date text, end_date text,
  owner_id uuid, owner_name text, owner_avatar text, shared_at timestamptz,
  together boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.title, h.kind, h.icon, h.color, h.schedule,
         h.target_amount, h.unit, h.start_date, h.end_date,
         s.owner_id, p.display_name, p.avatar_url, s.created_at, s.together
  from public.habit_shares s
  join public.habits h
    on h.id = s.habit_id and h.user_id = s.owner_id and h.deleted_at is null
  left join public.profiles p on p.id = s.owner_id
  where s.shared_with_id = (select auth.uid())
    and public.are_connected(s.owner_id, s.shared_with_id)
  order by p.display_name nulls last, h.title
$$;
revoke all on function public.get_shared_habits() from public, anon;
grant execute on function public.get_shared_habits() to authenticated;

-- Katıl: arayana paylaşılan alışkanlığın kopyasını açar. p_today = cihazın
-- bugünü ("YYYY-MM-DD"); kopya o gün başlar. Zaten üyeyse var olan kopyayı döner.
create or replace function public.join_habit_group(p_habit_id uuid, p_today text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_existing uuid;
  v_new uuid := gen_random_uuid();
  v_today text := case when public.try_date(p_today) is not null then p_today
                       else to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD') end;
begin
  if v_uid is null then
    raise exception using message = 'ERK_AUTH';
  end if;
  select h.user_id into v_owner
  from public.habits h
  join public.habit_shares s
    on s.habit_id = h.id and s.owner_id = h.user_id and s.shared_with_id = v_uid
  where h.id = p_habit_id and h.deleted_at is null
    and public.are_connected(h.user_id, v_uid);
  if v_owner is null then
    return jsonb_build_object('error', 'ERK_NOT_SHARED');
  end if;
  -- "Sadece görsünler" ile paylaşıldıysa katılım kapalı.
  if not exists (select 1 from public.habit_shares s
                 where s.habit_id = p_habit_id and s.shared_with_id = v_uid and s.together) then
    return jsonb_build_object('error', 'ERK_NOT_TOGETHER');
  end if;
  -- Zincir olmasın: bir üyenin kopyası kendi başına grup kuramaz.
  if exists (select 1 from public.habit_group_members m where m.member_habit_id = p_habit_id) then
    return jsonb_build_object('error', 'ERK_GROUP_NESTED');
  end if;
  -- Aynı anda katılanlar sınırı birlikte aşmasın.
  perform 1 from public.habits h where h.id = p_habit_id for update;

  select a.member_habit_id into v_existing
  from public.habit_group_active(p_habit_id) a
  where a.member_id = v_uid;
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'habit_id', v_existing);
  end if;
  if (select count(*) from public.habit_group_active(p_habit_id)) >= 4 then
    return jsonb_build_object('error', 'ERK_GROUP_FULL');
  end if;

  insert into public.habits (
    id, user_id, title, kind, icon, color, schedule, target_amount, unit,
    start_date, end_date, goal_factor, updated_at
  )
  select v_new, v_uid, h.title, h.kind, h.icon, h.color, h.schedule, h.target_amount, h.unit,
         greatest(v_today, h.start_date), h.end_date, 1, now()
  from public.habits h
  where h.id = p_habit_id;

  insert into public.habit_group_members (group_id, owner_id, member_id, member_habit_id)
  values (p_habit_id, v_owner, v_uid, v_new)
  on conflict (group_id, member_id) do update
    set member_habit_id = excluded.member_habit_id, joined_at = now();

  return jsonb_build_object('ok', true, 'habit_id', v_new);
end;
$$;
revoke all on function public.join_habit_group(uuid, text) from public, anon;
grant execute on function public.join_habit_group(uuid, text) to authenticated;

-- Called ONLY by the send-nudge Edge Function (service role), with the
-- sender's uid taken from their verified JWT. Clients can't call it: the
-- answer contains the recipient's device tokens.
create or replace function public.prepare_nudge(p_sender uuid, p_kind text, p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_title text;
  v_tokens jsonb;
begin
  if p_sender is null or p_item_id is null or p_kind is null or p_kind not in ('habit', 'goal') then
    return jsonb_build_object('status', 'forbidden');
  end if;

  -- The sender must currently receive this share, the owner must still own
  -- the (not deleted) item, and the two must still be friends.
  if p_kind = 'habit' then
    select s.owner_id, h.title into v_owner, v_title
    from public.habit_shares s
    join public.habits h on h.id = s.habit_id and h.user_id = s.owner_id and h.deleted_at is null
    where s.habit_id = p_item_id and s.shared_with_id = p_sender;
  else
    select s.owner_id, g.title into v_owner, v_title
    from public.goal_shares s
    join public.goals g on g.id = s.goal_id and g.user_id = s.owner_id and g.deleted_at is null
    where s.goal_id = p_item_id and s.shared_with_id = p_sender;
  end if;
  -- Ortak alışkanlık: aynı gruptaki bir arkadaşın kopyasına (ya da kurucunun
  -- alışkanlığına) da hatırlatma gidebilir; paylaşım kaydı aranmaz.
  if v_owner is null and p_kind = 'habit' then
    select h.user_id, h.title into v_owner, v_title
    from (select coalesce((select m.group_id from public.habit_group_members m
                           where m.member_habit_id = p_item_id), p_item_id) as gid) g
    join public.habits h on h.id = p_item_id and h.deleted_at is null
    where h.user_id <> p_sender
      and (exists (select 1 from public.habits fh
                   where fh.id = g.gid and fh.user_id = p_sender and fh.deleted_at is null)
           or exists (select 1 from public.habit_group_active(g.gid) a where a.member_id = p_sender))
      and (h.id = g.gid
           or exists (select 1 from public.habit_group_active(g.gid) a where a.member_habit_id = p_item_id));
  end if;
  if v_owner is null or not public.are_connected(v_owner, p_sender) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  delete from public.nudges n where n.created_at < now() - interval '30 days';

  -- Limits are checked BEFORE recording: a refused attempt doesn't count.
  if exists (
    select 1 from public.nudges n
    where n.sender_id = p_sender and n.item_kind = p_kind and n.item_id = p_item_id
      and n.created_at > now() - interval '1 hour'
  ) then
    return jsonb_build_object('status', 'rate_limited_item');
  end if;
  if (select count(*) from public.nudges n
      where n.sender_id = p_sender and n.created_at > now() - interval '24 hours') >= 20
     or (select count(*) from public.nudges n
         where n.recipient_id = v_owner and n.created_at > now() - interval '24 hours') >= 30 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  insert into public.nudges (sender_id, recipient_id, item_kind, item_id)
  values (p_sender, v_owner, p_kind, p_item_id);

  -- Muted / switched off: recorded (it still counts toward the limits) but
  -- not delivered, and answered like a delivered one by the Edge Function.
  if exists (select 1 from public.nudge_mutes m where m.muter_id = v_owner and m.muted_id = p_sender)
     or not coalesce((select p.nudges_enabled from public.profiles p where p.id = v_owner), true) then
    return jsonb_build_object('status', 'muted');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('token', t.token, 'locale', t.locale)), '[]'::jsonb)
  into v_tokens
  from public.push_tokens t
  where t.user_id = v_owner;
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
revoke all on function public.prepare_nudge(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.prepare_nudge(uuid, text, uuid) to service_role;
