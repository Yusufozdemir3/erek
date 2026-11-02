-- Erek — Faz 14: Ortak alışkanlık bildirimleri (davet + "herkes bitirdi")
-- Supabase panelinde: SQL Editor > New query > bu dosyayı yapıştır > Run.
-- Yeniden çalıştırılabilir. Faz 12 ve 13'ten SONRA çalıştırılır; ardından
-- send-nudge Edge Function yeniden yüklenir (supabase/functions/send-nudge).
--
--   * celebrations'a iki tür eklenir: 'invite' (sahip, "birlikte yapalım" ile
--     paylaştığı arkadaşlara) ve 'group_done' (son kişi işaretleyince diğerlerine).
--   * Gün başına bir 'group_done': celebrations.day eklenir, tekillik güne bağlanır.
--   * Bildirim yalnız Edge Function'dan (service role) gider; kutu (get_inbox)
--     bu satırları zaten okur.

alter table public.celebrations add column if not exists day text;

alter table public.celebrations drop constraint if exists celebrations_type_check;
alter table public.celebrations
  add constraint celebrations_type_check check (type in ('finished', 'congrats', 'invite', 'group_done'));

-- Eski tekillik (type, item_kind, item_id, sender_id, recipient_id) gün olmadan
-- günlük bildirime izin vermez: kaldır, güne bağlı bir indeksle değiştir.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.celebrations'::regclass
      and con.contype = 'u'
  loop
    execute format('alter table public.celebrations drop constraint %I', c.conname);
  end loop;
end $$;
create unique index if not exists celebrations_unique_per_day
  on public.celebrations (type, item_kind, item_id, sender_id, recipient_id, coalesce(day, ''));

-- Sahip, "birlikte yapalım" ile paylaştığı arkadaşlara davet gönderir (bir kez).
create or replace function public.prepare_invite(p_owner uuid, p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_out jsonb;
begin
  if p_owner is null or p_item_id is null then
    return jsonb_build_object('status', 'forbidden');
  end if;
  select h.title into v_title
  from public.habits h
  where h.id = p_item_id and h.user_id = p_owner and h.deleted_at is null;
  if v_title is null then
    return jsonb_build_object('status', 'forbidden');
  end if;

  with sharees as (
    select s.shared_with_id as uid
    from public.habit_shares s
    where s.habit_id = p_item_id and s.owner_id = p_owner and s.together
  ),
  eligible as (
    select sh.uid from sharees sh
    where public.are_connected(p_owner, sh.uid)
      and not exists (select 1 from public.habit_group_active(p_item_id) a where a.member_id = sh.uid)
      and coalesce((select p.nudges_enabled from public.profiles p where p.id = sh.uid), true)
      and not exists (select 1 from public.nudge_mutes m where m.muter_id = sh.uid and m.muted_id = p_owner)
  ),
  fresh as (
    insert into public.celebrations (type, item_kind, item_id, sender_id, recipient_id)
    select 'invite', 'habit', p_item_id, p_owner, e.uid from eligible e
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
revoke all on function public.prepare_invite(uuid, uuid) from public, anon, authenticated;
grant execute on function public.prepare_invite(uuid, uuid) to service_role;

-- Grubun herkesi (kurucu + geçerli üyeler): kullanıcı, o kişinin alışkanlığı, dinlenme günleri.
create or replace function public.habit_group_people(p_group uuid)
returns table (uid uuid, hid uuid, skip text)
language sql
stable
security definer
set search_path = ''
as $$
  select h.user_id, h.id, h.skip_dates from public.habits h
  where h.id = p_group and h.deleted_at is null
  union all
  select a.member_id, a.member_habit_id, mh.skip_dates
  from public.habit_group_active(p_group) a
  join public.habits mh on mh.id = a.member_habit_id
$$;
revoke all on function public.habit_group_people(uuid) from public, anon, authenticated;

-- Grubun son kişisi işaretledi: diğer üyelere "bugün hepiniz tamamladınız".
-- p_item_id = göndericinin KENDİ alışkanlığı (kurucununki ya da kopyası); p_day
-- = cihazın bugünü. Sunucu herkesin o gün işaretlediğini (ya da dinlendiğini)
-- doğrular; gün başına kişi başı bir bildirim.
create or replace function public.prepare_group_done(p_sender uuid, p_item_id uuid, p_day text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gid uuid;
  v_title text;
  v_out jsonb;
begin
  if p_sender is null or p_item_id is null or public.try_date(p_day) is null then
    return jsonb_build_object('status', 'forbidden');
  end if;
  v_gid := coalesce((select m.group_id from public.habit_group_members m where m.member_habit_id = p_item_id), p_item_id);

  if not exists (select 1 from public.habit_group_people(v_gid) p where p.uid = p_sender and p.hid = p_item_id) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if (select count(*) from public.habit_group_people(v_gid)) < 2 then
    return jsonb_build_object('status', 'nobody');
  end if;
  -- Herkes o gün yaptı mı (ya da dinleniyor mu)?
  if exists (
    select 1 from public.habit_group_people(v_gid) p
    where not exists (select 1 from public.habit_logs l
                      where l.habit_id = p.hid and l.log_date = p_day and l.completed = 1)
      and coalesce(p.skip, '') not like '%"' || p_day || '"%'
  ) then
    return jsonb_build_object('status', 'not_done');
  end if;

  select h.title into v_title from public.habits h where h.id = p_item_id;

  with eligible as (
    select p.uid, p.hid from public.habit_group_people(v_gid) p
    where p.uid <> p_sender
      and public.are_connected(p_sender, p.uid)
      and coalesce((select pr.nudges_enabled from public.profiles pr where pr.id = p.uid), true)
      and not exists (select 1 from public.nudge_mutes m where m.muter_id = p.uid and m.muted_id = p_sender)
  ),
  fresh as (
    insert into public.celebrations (type, item_kind, item_id, sender_id, recipient_id, day)
    select 'group_done', 'habit', e.hid, p_sender, e.uid, p_day from eligible e
    on conflict do nothing
    returning recipient_id, item_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'recipient', f.recipient_id,
           'item_id', f.item_id,
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
    'sender_name', (select pr.display_name from public.profiles pr where pr.id = p_sender),
    'item_title', v_title,
    'recipients', v_out
  );
end;
$$;
revoke all on function public.prepare_group_done(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.prepare_group_done(uuid, uuid, text) to service_role;
