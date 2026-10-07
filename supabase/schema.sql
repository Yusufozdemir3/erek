-- Erek — Supabase şeması (Google girişi + RLS)
-- Supabase panelinde: SQL Editor > New query > bu dosyayı yapıştır > Run.
--
-- PANEL AYARI: Authentication > Providers > "Anonymous sign-ins" KAPALI olmalı.
-- Uygulama anonim oturum açmaz (src/sync/auth.ts); açık kalırsa APK'daki anon
-- key ile herkes `authenticated` bir jeton alıp satır oluşturabilir.
--
-- Tasarım: id'ler cihazda üretilen UUID. user_id = auth.uid() (giriş yapmış kullanıcı).
-- Tarih/saat alanlarının çoğu uygulamada metin (ISO ya da "YYYY-MM-DD"); senkron
-- filigranı için yalnızca updated_at timestamptz. RLS her kullanıcıyı kendi
-- satırlarına kısıtlar.

create table if not exists public.goals (
  id            uuid primary key,
  user_id       uuid not null,
  title         text not null,
  goal_type     text not null,             -- 'numeric' | 'milestone'
  target_value  double precision,
  current_value double precision not null default 0,
  unit          text,
  deadline      text,
  completed_at  text,                      -- yalnız 'milestone' hedeflerde anlamlı
  remind_at     text,                      -- "HH:MM" günlük giriş hatırlatması
  -- current_value bir önbellektir: value_baseline + goal_entries (yerel
  -- migration019). Girdiler satır satır birleşir; baseline elle düzeltmeleri taşır.
  value_baseline double precision not null default 0,
  updated_at    timestamptz not null,
  deleted_at    timestamptz
);
alter table public.goals add column if not exists completed_at text;

create table if not exists public.habits (
  id         uuid primary key,
  user_id    uuid not null,
  goal_id    uuid,
  title         text not null,
  kind          text not null default 'binary',
  remind_at     text,
  icon          text,
  color         text,
  schedule      text,
  target_amount double precision,
  unit          text,
  start_date    text,
  end_date      text,
  -- Mola günleri: "YYYY-MM-DD" JSON dizisi (yerel migration022'nin karşılığı).
  skip_dates    text,
  -- Bağlı hedefe katkı biçimi + birim çarpanı (yerel migration010'un karşılığı).
  -- NULL = 'per_completion' (tamamlanan gün başına +1); 'amount' = o gün yapılan
  -- miktar × goal_factor hedefe eklenir.
  goal_contribution text,
  goal_factor   double precision not null default 1,
  updated_at    timestamptz not null,
  deleted_at    timestamptz
);

-- Mevcut projelere yeni kolonları ekle (create table if not exists mevcut tabloyu
-- değiştirmez; bu dosyayı yeniden çalıştırınca eksik kolonlar böyle eklenir).
alter table public.habits add column if not exists icon          text;
alter table public.habits add column if not exists color         text;
alter table public.habits add column if not exists schedule      text;
alter table public.habits add column if not exists target_amount double precision;
alter table public.habits add column if not exists unit          text;
alter table public.habits add column if not exists start_date    text;
alter table public.habits add column if not exists end_date      text;
alter table public.habits add column if not exists skip_dates    text;
alter table public.habits add column if not exists kind          text not null default 'binary';
update public.habits set kind = 'numeric' where kind = 'binary' and target_amount is not null and target_amount > 0;
-- Bağlı hedefe katkı biçimi + çarpan (yerel migration010). Yeni kolonlar
-- İSTEMCİDEN ÖNCE eklenmeli, yoksa push "Could not find the ... column" ile düşer.
alter table public.habits add column if not exists goal_contribution text;
alter table public.habits add column if not exists goal_factor   double precision not null default 1;

create table if not exists public.tasks (
  id           uuid primary key,
  user_id      uuid not null,
  title        text not null,
  due_date     text,
  end_time     text,
  priority     text not null default 'medium',
  recurrence   text,
  remind_at    text,                       -- "HH:MM"; son tarih gününde hatırlatma (due_date saatinden bağımsız)
  completed_at text,
  updated_at   timestamptz not null,
  deleted_at   timestamptz
);
-- Mevcut kurulumlar için idempotent kolon eklemesi (bitiş saati + hatırlatma saati).
alter table public.tasks add column if not exists end_time text;
alter table public.tasks add column if not exists remind_at text;

create table if not exists public.habit_logs (
  id         uuid primary key,
  habit_id   uuid not null,
  log_date   text not null,
  completed  integer not null default 0,
  amount     double precision not null default 0,
  updated_at timestamptz not null
);

create table if not exists public.subtasks (
  id         uuid primary key,
  task_id    uuid not null,
  title      text not null,
  completed  integer not null default 0,
  position   integer not null default 0,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table if not exists public.goal_milestones (
  id         uuid primary key,
  goal_id    uuid not null,
  title      text not null,
  completed  integer not null default 0,
  position   integer not null default 0,
  amount     double precision,
  due_date   text,
  updated_at timestamptz not null,
  deleted_at timestamptz
);
-- Mevcut kurulumlar için idempotent kolon eklemeleri (adım miktarı + son tarihi,
-- hedefe günlük giriş hatırlatma saati) — yerel migration013'ün karşılığı.
alter table public.goal_milestones add column if not exists amount double precision;
alter table public.goal_milestones add column if not exists due_date text;
alter table public.goals add column if not exists remind_at text;
-- Tempo/projeksiyon hesabının sıfır günü — yerel migration015'in karşılığı.
alter table public.goals add column if not exists start_date text;
-- İlerlemenin girdilerle temsil edilmeyen parçası (yerel migration019).
alter table public.goals add column if not exists value_baseline double precision not null default 0;

-- İlerleme girdileri — ilerlemenin kaynağı (current_value = baseline + girdiler).
-- Arkadaşın paylaşılan hedefe katkısı da buraya düşer (added_by, PHASE 4).
create table if not exists public.goal_entries (
  id         uuid primary key,
  goal_id    uuid not null,
  amount     double precision not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

alter table public.habit_logs add column if not exists amount double precision not null default 0;

-- Alışkanlık/görev/hedef başına istenen sayıda hatırlatma (yerel migration016).
-- Eski remind_at kolonları duruyor ama okunmuyor.
create table if not exists public.reminders (
  id          uuid primary key,
  entity_type text not null,       -- 'habit' | 'task' | 'goal'
  entity_id   uuid not null,
  time        text not null,       -- "HH:MM"
  updated_at  timestamptz not null,
  deleted_at  timestamptz
);
create index if not exists idx_reminders_entity on public.reminders(entity_type, entity_id);

-- Senkron pull'u updated_at'e göre filtreler; indeksle.
create index if not exists idx_goals_updated  on public.goals(updated_at);
create index if not exists idx_habits_updated on public.habits(updated_at);
create index if not exists idx_tasks_updated  on public.tasks(updated_at);
create index if not exists idx_logs_updated   on public.habit_logs(updated_at);
create index if not exists idx_subtasks_updated on public.subtasks(updated_at);
create index if not exists idx_goal_milestones_updated on public.goal_milestones(updated_at);
create index if not exists idx_goal_entries_updated on public.goal_entries(updated_at);
create index if not exists idx_reminders_updated on public.reminders(updated_at);

-- SUNUCU ZAMAN DAMGASI -----------------------------------------------------
-- updated_at istemci saatidir; ileri kaymış bir saat pull filigranını bozar.
-- Pull filtresi ve filigran server_updated_at'e bakar, son-yazan-kazanır
-- kıyası updated_at'e. İstemci bu kolonu yazmaz; trigger her yazışta damgalar.
create or replace function public.set_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

-- Tüm senkron tablolarına idempotent kolon + indeks + trigger.
do $$
declare t text;
begin
  foreach t in array array[
    'goals','goal_milestones','goal_entries','habits',
    'tasks','reminders','habit_logs','subtasks'
  ] loop
    execute format(
      'alter table public.%I add column if not exists server_updated_at timestamptz not null default now()', t);
    execute format(
      'create index if not exists idx_%s_server_updated on public.%I(server_updated_at)', t, t);
    execute format(
      'drop trigger if exists trg_%s_server_updated on public.%I', t, t);
    execute format(
      'create trigger trg_%s_server_updated before insert or update on public.%I
         for each row execute function public.set_server_updated_at()', t, t);
  end loop;
end $$;

-- ROW LEVEL SECURITY -------------------------------------------------------
alter table public.goals      enable row level security;
alter table public.habits     enable row level security;
alter table public.tasks      enable row level security;
alter table public.habit_logs enable row level security;
alter table public.subtasks   enable row level security;
alter table public.goal_milestones enable row level security;
alter table public.goal_entries enable row level security;
alter table public.reminders   enable row level security;

-- Policy'ler idempotent: önce varsa düşür, sonra yeniden kur. Böylece bu dosya
-- güvenle yeniden çalıştırılabilir ("already exists" hatası vermez, yarım kalmaz).

-- user_id taşıyan tablolar: yalnızca sahibinin satırları.
drop policy if exists "own goals"  on public.goals;
create policy "own goals"  on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own habits" on public.habits;
create policy "own habits" on public.habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own tasks"  on public.tasks;
create policy "own tasks"  on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- habit_logs'un user_id'si yok; sahiplik bağlı olduğu habit üzerinden kontrol edilir.
drop policy if exists "own habit_logs" on public.habit_logs;
create policy "own habit_logs" on public.habit_logs
  for all
  using (exists (
    select 1 from public.habits h
    where h.id = habit_logs.habit_id and h.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.habits h
    where h.id = habit_logs.habit_id and h.user_id = auth.uid()
  ));

-- subtasks'ın da user_id'si yok; sahiplik bağlı olduğu görev üzerinden.
drop policy if exists "own subtasks" on public.subtasks;
create policy "own subtasks" on public.subtasks
  for all
  using (exists (
    select 1 from public.tasks t
    where t.id = subtasks.task_id and t.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.tasks t
    where t.id = subtasks.task_id and t.user_id = auth.uid()
  ));

-- goal_milestones'ın da user_id'si yok; sahiplik bağlı olduğu hedef üzerinden.
drop policy if exists "own goal_milestones" on public.goal_milestones;
create policy "own goal_milestones" on public.goal_milestones
  for all
  using (exists (
    select 1 from public.goals g
    where g.id = goal_milestones.goal_id and g.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.goals g
    where g.id = goal_milestones.goal_id and g.user_id = auth.uid()
  ));

-- goal_entries'ın da user_id'si yok; sahiplik bağlı olduğu hedef üzerinden.
drop policy if exists "own goal_entries" on public.goal_entries;
create policy "own goal_entries" on public.goal_entries
  for all
  using (exists (
    select 1 from public.goals g
    where g.id = goal_entries.goal_id and g.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.goals g
    where g.id = goal_entries.goal_id and g.user_id = auth.uid()
  ));

-- reminders'ın user_id'si yok; sahiplik entity_type'a göre bağlı olduğu
-- alışkanlık/görev/hedef üzerinden (üç olası ebeveynden biri).
drop policy if exists "own reminders" on public.reminders;
create policy "own reminders" on public.reminders
  for all
  using (
    (entity_type = 'habit' and exists (select 1 from public.habits h where h.id = reminders.entity_id and h.user_id = auth.uid()))
    or (entity_type = 'task' and exists (select 1 from public.tasks t where t.id = reminders.entity_id and t.user_id = auth.uid()))
    or (entity_type = 'goal' and exists (select 1 from public.goals g where g.id = reminders.entity_id and g.user_id = auth.uid()))
  )
  with check (
    (entity_type = 'habit' and exists (select 1 from public.habits h where h.id = reminders.entity_id and h.user_id = auth.uid()))
    or (entity_type = 'task' and exists (select 1 from public.tasks t where t.id = reminders.entity_id and t.user_id = auth.uid()))
    or (entity_type = 'goal' and exists (select 1 from public.goals g where g.id = reminders.entity_id and g.user_id = auth.uid()))
  );

-- HESAP SİLME ---------------------------------------------------------------
-- Uygulama içi "Hesabı sil" (Play zorunluluğu). İstemci kendi auth kaydını
-- silemez, bu SECURITY DEFINER fonksiyon çağıranın tüm verisini ve auth kaydını
-- tek işlemde siler (sahibi postgres). auth.uid() ile yalnızca KENDİNİ.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'delete_account: oturum yok';
  end if;
  -- Çocuk tablolar önce (bulut şemasında FK kısıtı yok ama sıra temiz olsun).
  delete from public.reminders where
    (entity_type = 'habit' and entity_id in (select id from public.habits where user_id = uid))
    or (entity_type = 'task' and entity_id in (select id from public.tasks where user_id = uid))
    or (entity_type = 'goal' and entity_id in (select id from public.goals where user_id = uid));
  delete from public.habit_logs where habit_id in (select id from public.habits where user_id = uid);
  delete from public.subtasks   where task_id  in (select id from public.tasks  where user_id = uid);
  delete from public.goal_milestones where goal_id in (select id from public.goals where user_id = uid);
  delete from public.goal_entries    where goal_id in (select id from public.goals where user_id = uid);
  delete from public.tasks  where user_id = uid;
  delete from public.habits where user_id = uid;
  delete from public.goals  where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

-- Yalnızca oturumlu kullanıcılar çağırabilsin.
revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- =============================================================================
-- FRIENDS / SHARING — PHASE 1: connections via invite code
-- =============================================================================
-- Security model:
--   - Clients never write these tables directly. Every write goes through a
--     SECURITY DEFINER RPC that validates the caller (auth.uid()).
--   - Every new function pins `search_path = ''` and uses fully-qualified
--     names, so an object planted on the search path can't hijack it.
--   - Policies use `(select auth.uid())` so Postgres evaluates it once per
--     query (InitPlan) instead of once per row.
--   - A user's display name/avatar are derived server-side from auth.users
--     (trigger below); the avatar is restricted to Google's image host so a
--     crafted URL can't be used as a tracking pixel against friends.
--   - All new tables reference auth.users ON DELETE CASCADE, so
--     delete_account() (which deletes the auth.users row) removes them too.

create or replace function public.safe_avatar_url(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_url ~ '^https://[a-z0-9-]+\.googleusercontent\.com/' and char_length(p_url) <= 1000
      then p_url
    else null
  end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://[a-z0-9-]+\.googleusercontent\.com/'),
  updated_at timestamptz not null default now()
);

-- One canonical row per friendship (user_a < user_b): there is no second,
-- mirrored row that could get out of sync with the first.
create table if not exists public.connections (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists idx_connections_user_b on public.connections(user_b);

create table if not exists public.friend_invites (
  code text primary key,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz
);
create index if not exists idx_friend_invites_inviter on public.friend_invites(inviter_id);

-- Failed redeem attempts, for rate limiting code guessing.
create table if not exists public.invite_redeem_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists idx_invite_redeem_attempts
  on public.invite_redeem_attempts(user_id, attempted_at);

alter table public.profiles               enable row level security;
alter table public.connections            enable row level security;
alter table public.friend_invites         enable row level security;
alter table public.invite_redeem_attempts enable row level security;

-- Read-only access to your OWN rows; friends' profiles are only reachable
-- through list_connections()/redeem_invite(). No insert/update/delete policies
-- anywhere: only the SECURITY DEFINER functions below can write.
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select using (id = (select auth.uid()));

drop policy if exists "connections member read" on public.connections;
create policy "connections member read" on public.connections
  for select using ((select auth.uid()) in (user_a, user_b));

drop policy if exists "invites own read" on public.friend_invites;
create policy "invites own read" on public.friend_invites
  for select using (inviter_id = (select auth.uid()));
-- invite_redeem_attempts: RLS on and NO policy = no direct client access at all.

-- Profile maintained from the auth record (Google full_name/avatar_url).
create or replace function public.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, updated_at)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), 80),
    public.safe_avatar_url(coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')),
    now()
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        avatar_url   = excluded.avatar_url,
        updated_at   = now();
  return new;
end;
$$;
revoke all on function public.sync_profile_from_auth() from public, anon, authenticated;

drop trigger if exists trg_profile_from_auth on auth.users;
create trigger trg_profile_from_auth
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function public.sync_profile_from_auth();

-- One-time backfill for users who signed up before this trigger existed (idempotent).
insert into public.profiles (id, display_name, avatar_url, updated_at)
select
  u.id,
  left(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'), 80),
  public.safe_avatar_url(coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')),
  now()
from auth.users u
on conflict (id) do update
  set display_name = excluded.display_name,
      avatar_url   = excluded.avatar_url,
      updated_at   = now();

create or replace function public.are_connected(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.connections c
    where c.user_a = least(a, b) and c.user_b = greatest(a, b)
  )
$$;
revoke all on function public.are_connected(uuid, uuid) from public, anon;
grant execute on function public.are_connected(uuid, uuid) to authenticated;

-- Returns the caller's live invite, creating one if needed. Repeated calls
-- return the SAME code (no row per tap); p_rotate discards it and issues a new one.
-- Code: 8 symbols from a 31-letter alphabet without look-alikes (0/O, 1/I/L),
-- ~8.5e11 combinations, drawn from a CSPRNG. Bytes >= 248 (= 31*8) are
-- rejected so every symbol is equally likely (no modulo bias).
create or replace function public.get_or_create_invite(p_rotate boolean default false)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_bytes bytea;
  v_b int;
begin
  if v_uid is null then
    raise exception using message = 'ERK_AUTH';
  end if;

  -- Housekeeping: this user's expired or already-used invites are dead weight.
  delete from public.friend_invites fi
  where fi.inviter_id = v_uid and (fi.expires_at <= now() or fi.used_by is not null);

  if p_rotate then
    delete from public.friend_invites fi where fi.inviter_id = v_uid;
  else
    return query
      select fi.code, fi.expires_at
      from public.friend_invites fi
      where fi.inviter_id = v_uid
      order by fi.created_at desc
      limit 1;
    if found then
      return;
    end if;
  end if;

  loop
    v_code := '';
    while char_length(v_code) < 8 loop
      v_bytes := extensions.gen_random_bytes(16);
      for i in 0..15 loop
        v_b := get_byte(v_bytes, i);
        if v_b < 248 and char_length(v_code) < 8 then
          v_code := v_code || substr(v_alphabet, (v_b % 31) + 1, 1);
        end if;
      end loop;
    end loop;
    begin
      insert into public.friend_invites (code, inviter_id) values (v_code, v_uid);
      exit;
    exception when unique_violation then
      -- Astronomically rare collision: draw a new code.
    end;
  end loop;

  return query
    select fi.code, fi.expires_at from public.friend_invites fi where fi.code = v_code;
end;
$$;
revoke all on function public.get_or_create_invite(boolean) from public, anon;
grant execute on function public.get_or_create_invite(boolean) to authenticated;

-- Redeems a friend's code and creates the connection.
-- Expected failures are RETURNED as {"error": "ERK_..."} instead of raised: a
-- raise would roll back the failed-attempt row below and silently disable the
-- rate limit. Unknown, expired and already-used codes all return the same
-- ERK_INVITE_INVALID so the response never reveals which codes exist.
create or replace function public.redeem_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_inviter uuid;
  v_friend jsonb;
begin
  if v_uid is null then
    raise exception using message = 'ERK_AUTH';
  end if;

  delete from public.invite_redeem_attempts a
  where a.user_id = v_uid and a.attempted_at < now() - interval '1 day';

  if (select count(*) from public.invite_redeem_attempts a
      where a.user_id = v_uid and a.attempted_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('error', 'ERK_RATE_LIMITED');
  end if;

  -- FOR UPDATE: two people redeeming the same code at once can't both win.
  select fi.inviter_id into v_inviter
  from public.friend_invites fi
  where fi.code = v_code and fi.used_by is null and fi.expires_at > now()
  for update;

  if v_inviter is null then
    insert into public.invite_redeem_attempts (user_id) values (v_uid);
    return jsonb_build_object('error', 'ERK_INVITE_INVALID');
  end if;
  if v_inviter = v_uid then
    return jsonb_build_object('error', 'ERK_INVITE_SELF');
  end if;
  if public.are_connected(v_uid, v_inviter) then
    return jsonb_build_object('error', 'ERK_ALREADY_CONNECTED');
  end if;
  if (select count(*) from public.connections c where v_uid in (c.user_a, c.user_b)) >= 50
     or (select count(*) from public.connections c where v_inviter in (c.user_a, c.user_b)) >= 50 then
    return jsonb_build_object('error', 'ERK_CONNECTION_LIMIT');
  end if;

  insert into public.connections (user_a, user_b)
  values (least(v_uid, v_inviter), greatest(v_uid, v_inviter))
  on conflict do nothing;

  update public.friend_invites fi
  set used_by = v_uid, used_at = now()
  where fi.code = v_code;

  select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url)
  into v_friend
  from public.profiles p
  where p.id = v_inviter;

  return jsonb_build_object('friend', coalesce(v_friend, jsonb_build_object('id', v_inviter)));
end;
$$;
revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

create or replace function public.list_connections()
returns table (id uuid, display_name text, avatar_url text, connected_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.friend_id, p.display_name, p.avatar_url, f.created_at
  from (
    select
      case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end as friend_id,
      c.created_at
    from public.connections c
    where c.user_a = (select auth.uid()) or c.user_b = (select auth.uid())
  ) f
  left join public.profiles p on p.id = f.friend_id
  order by p.display_name nulls last
$$;
revoke all on function public.list_connections() from public, anon;
grant execute on function public.list_connections() to authenticated;

-- =============================================================================
-- FRIENDS / SHARING — PHASE 2: read-only habit sharing
-- =============================================================================
-- The habits/habit_logs policies are deliberately NOT widened: sync pulls
-- rely purely on RLS for visibility, so a wider SELECT policy would drop a
-- friend's habit into the recipient's own habit list (and make every owner
-- pull costlier). A friend's habit is only reachable through the functions
-- below, which verify the share and return display fields only (no goal link,
-- no reminder times).

create table if not exists public.habit_shares (
  habit_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  shared_with_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (habit_id, shared_with_id)
);
create index if not exists idx_habit_shares_recipient on public.habit_shares(shared_with_id);
create index if not exists idx_habit_shares_owner on public.habit_shares(owner_id);
-- Keyset scan of one habit's logs in server-time order (get_shared_habit_logs).
create index if not exists idx_habit_logs_habit_server on public.habit_logs(habit_id, server_updated_at, id);

alter table public.habit_shares enable row level security;
drop policy if exists "habit_shares member read" on public.habit_shares;
create policy "habit_shares member read" on public.habit_shares
  for select using ((select auth.uid()) in (owner_id, shared_with_id));
-- No write policies: share_habit()/unshare_habit() are the only writers.

create or replace function public.share_habit(p_habit_id uuid, p_friend uuid)
returns jsonb
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
  -- Also the answer for "not yours": indistinguishable on purpose.
  if not exists (
    select 1 from public.habits h
    where h.id = p_habit_id and h.user_id = v_uid and h.deleted_at is null
  ) then
    return jsonb_build_object('error', 'ERK_HABIT_NOT_SYNCED');
  end if;
  if not public.are_connected(v_uid, p_friend) then
    return jsonb_build_object('error', 'ERK_NOT_CONNECTED');
  end if;
  if (select count(*) from public.habit_shares s where s.habit_id = p_habit_id) >= 20 then
    return jsonb_build_object('error', 'ERK_SHARE_LIMIT');
  end if;
  insert into public.habit_shares (habit_id, owner_id, shared_with_id)
  values (p_habit_id, v_uid, p_friend)
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.share_habit(uuid, uuid) from public, anon;
grant execute on function public.share_habit(uuid, uuid) to authenticated;

-- The owner stops sharing with p_friend, or a recipient removes a habit shared
-- with them (p_friend is ignored in that case).
create or replace function public.unshare_habit(p_habit_id uuid, p_friend uuid)
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
  delete from public.habit_shares s
  where s.habit_id = p_habit_id
    and ((s.owner_id = v_uid and s.shared_with_id = p_friend) or s.shared_with_id = v_uid);
end;
$$;
revoke all on function public.unshare_habit(uuid, uuid) from public, anon;
grant execute on function public.unshare_habit(uuid, uuid) to authenticated;

-- Habits shared with the caller. The share row's owner must still own the
-- habit and still be connected (defense in depth on top of remove_connection).
create or replace function public.get_shared_habits()
returns table (
  id uuid, title text, kind text, icon text, color text, schedule text,
  target_amount double precision, unit text, start_date text, end_date text,
  owner_id uuid, owner_name text, owner_avatar text, shared_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.title, h.kind, h.icon, h.color, h.schedule,
         h.target_amount, h.unit, h.start_date, h.end_date,
         s.owner_id, p.display_name, p.avatar_url, s.created_at
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

-- One page (max 2000) of a shared habit's logs after the keyset cursor
-- (server_updated_at, id). The client fetches incrementally and caches.
create or replace function public.get_shared_habit_logs(
  p_habit_id uuid,
  p_after_ts timestamptz default '-infinity',
  p_after_id uuid default '00000000-0000-0000-0000-000000000000'
)
returns table (
  id uuid, log_date text, completed integer, amount double precision,
  updated_at timestamptz, server_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not exists (
    select 1
    from public.habit_shares s
    join public.habits h
      on h.id = s.habit_id and h.user_id = s.owner_id and h.deleted_at is null
    where s.habit_id = p_habit_id
      and s.shared_with_id = (select auth.uid())
      and public.are_connected(s.owner_id, s.shared_with_id)
  ) then
    raise exception using message = 'ERK_NOT_SHARED';
  end if;

  return query
    select l.id, l.log_date, l.completed, l.amount, l.updated_at, l.server_updated_at
    from public.habit_logs l
    where l.habit_id = p_habit_id
      and (l.server_updated_at, l.id) > (coalesce(p_after_ts, '-infinity'::timestamptz),
                                         coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid))
    order by l.server_updated_at, l.id
    limit 2000;
end;
$$;
revoke all on function public.get_shared_habit_logs(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.get_shared_habit_logs(uuid, timestamptz, uuid) to authenticated;

-- =============================================================================
-- FRIENDS / SHARING — PHASE 3: shared tasks (the friend may only check off)
-- =============================================================================
-- Unlike habits, a shared task DOES flow through the normal sync pull (it must
-- appear in the friend's own task lists), so the tasks SELECT policy is widened.
-- Writes stay owner-only: the friend's device never pushes the row (client
-- guarantees it) and its only write path is toggle_shared_task().
-- Triggers on the push path NEVER raise — a raise would permanently wedge the
-- owner's sync on that row. Invalid values are corrected instead, and the
-- correction bumps updated_at so every device adopts it via last-writer-wins.

-- Run before shipping a client that pushes shared_with_id.
alter table public.tasks add column if not exists shared_with_id uuid references auth.users(id) on delete set null;
create index if not exists idx_tasks_shared_with on public.tasks(shared_with_id) where shared_with_id is not null;
-- Lets the planner answer "user_id = me OR shared_with_id = me" with a BitmapOr.
create index if not exists idx_tasks_user on public.tasks(user_id);

-- CLIENT CAPABILITY GATE. Tasks shared WITH me go only to clients sending
-- `x-erek-sharing: 1` (src/sync/supabase.ts); an older version would store a
-- friend's task as its own and wedge its sync on the first edit. Without the
-- header this is the plain "own tasks" policy. Not a security boundary.
create or replace function public.client_supports_sharing()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('request.headers', true)::json ->> 'x-erek-sharing', '') = '1'
$$;
revoke all on function public.client_supports_sharing() from public, anon;
grant execute on function public.client_supports_sharing() to authenticated;

drop policy if exists "own tasks" on public.tasks;
drop policy if exists "tasks select" on public.tasks;
drop policy if exists "tasks insert" on public.tasks;
drop policy if exists "tasks update" on public.tasks;
drop policy if exists "tasks delete" on public.tasks;
create policy "tasks select" on public.tasks for select
  using (
    user_id = (select auth.uid())
    or (shared_with_id = (select auth.uid()) and (select public.client_supports_sharing()))
  );
create policy "tasks insert" on public.tasks for insert
  with check (user_id = (select auth.uid()));
create policy "tasks update" on public.tasks for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "tasks delete" on public.tasks for delete
  using (user_id = (select auth.uid()));

create or replace function public.tasks_sharing_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 1) Lost-update guard, only on shared tasks: an owner's OFFLINE edit made
  --    before the friend's check-off must not undo that check-off. Other
  --    columns (title, date...) still go through; completion keeps the newer value.
  if tg_op = 'UPDATE' and old.shared_with_id is not null and new.updated_at < old.updated_at then
    new.completed_at := old.completed_at;
    new.updated_at := old.updated_at;
  end if;

  -- 2) A share is only valid toward a connected friend, never to yourself,
  --    never on a recurring task (recurrence is computed client-side).
  if new.shared_with_id is not null and (
       new.shared_with_id = new.user_id
       or new.recurrence is not null
       or not public.are_connected(new.user_id, new.shared_with_id)) then
    new.shared_with_id := null;
    new.updated_at := greatest(new.updated_at, now());
  end if;

  -- 3) A share cleared WITHOUT a newer client timestamp (ON DELETE SET NULL
  --    when the friend deletes their account): make it win on the owner's devices.
  if tg_op = 'UPDATE' and old.shared_with_id is not null and new.shared_with_id is null
     and new.updated_at <= old.updated_at then
    new.updated_at := now();
  end if;

  return new;
end;
$$;
revoke all on function public.tasks_sharing_guard() from public, anon, authenticated;

drop trigger if exists trg_tasks_sharing_guard on public.tasks;
create trigger trg_tasks_sharing_guard
  before insert or update on public.tasks
  for each row execute function public.tasks_sharing_guard();

-- The friend's ONLY write path: flips completion and nothing else.
-- completed_at is stored as text by the app (JS toISOString format).
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
    and t.shared_with_id = v_uid
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
  -- updated_at bump: owners' devices adopt the cleared share via LWW; the
  -- friend's device drops the task in its post-pull reconciliation.
  update public.tasks t
  set shared_with_id = null, updated_at = now()
  where (t.user_id = v_uid and t.shared_with_id = p_friend)
     or (t.user_id = p_friend and t.shared_with_id = v_uid);
end;
$$;
revoke all on function public.remove_connection(uuid) from public, anon;
grant execute on function public.remove_connection(uuid) to authenticated;

-- =============================================================================
-- FRIENDS / SHARING — PHASE 4: shared goals (the friend may view AND contribute)
-- =============================================================================
-- Same read path as habits (PHASE 2): the goals/goal_entries policies stay
-- owner-only, so a friend's goal never lands in the recipient's own sync pull;
-- it's reachable only through the functions below. The friend's ONLY write path
-- is add_shared_goal_entry(): it appends a goal_entries row to the OWNER's goal,
-- stamped with added_by. The owner's devices pull that row like any other entry
-- (goal_entries RLS goes through goal ownership) and re-derive current_value
-- from baseline + entries, so contributions merge without conflict.

-- Who added an entry; NULL = the owner. Deliberately no foreign key: a deleted
-- contributor's entries stay in the history instead of turning into the owner's.
-- Run before shipping a client that pushes added_by.
alter table public.goal_entries add column if not exists added_by uuid;
-- Rate limit lookup in add_shared_goal_entry.
create index if not exists idx_goal_entries_added_by
  on public.goal_entries(added_by, server_updated_at) where added_by is not null;

create table if not exists public.goal_shares (
  goal_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  shared_with_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (goal_id, shared_with_id)
);
create index if not exists idx_goal_shares_recipient on public.goal_shares(shared_with_id);
create index if not exists idx_goal_shares_owner on public.goal_shares(owner_id);

alter table public.goal_shares enable row level security;
drop policy if exists "goal_shares member read" on public.goal_shares;
create policy "goal_shares member read" on public.goal_shares
  for select using ((select auth.uid()) in (owner_id, shared_with_id));
-- No write policies: share_goal()/unshare_goal() are the only writers.

-- A goal's current value, derived exactly like the client does it (see local
-- migration019): baseline + active entries, never below zero. Computed here
-- rather than read from goals.current_value, which is only the owner's cache
-- and lags behind a friend's contribution until the owner syncs.
create or replace function public.goal_current_value(p_goal_id uuid)
returns double precision
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, g.value_baseline + coalesce((
    select sum(e.amount) from public.goal_entries e
    where e.goal_id = g.id and e.deleted_at is null
  ), 0))
  from public.goals g
  where g.id = p_goal_id
$$;
revoke all on function public.goal_current_value(uuid) from public, anon, authenticated;

create or replace function public.share_goal(p_goal_id uuid, p_friend uuid)
returns jsonb
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
  -- Also the answer for "not yours": indistinguishable on purpose.
  if not exists (
    select 1 from public.goals g
    where g.id = p_goal_id and g.user_id = v_uid and g.deleted_at is null
  ) then
    return jsonb_build_object('error', 'ERK_GOAL_NOT_SYNCED');
  end if;
  if not public.are_connected(v_uid, p_friend) then
    return jsonb_build_object('error', 'ERK_NOT_CONNECTED');
  end if;
  if (select count(*) from public.goal_shares s where s.goal_id = p_goal_id) >= 20 then
    return jsonb_build_object('error', 'ERK_SHARE_LIMIT');
  end if;
  insert into public.goal_shares (goal_id, owner_id, shared_with_id)
  values (p_goal_id, v_uid, p_friend)
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.share_goal(uuid, uuid) from public, anon;
grant execute on function public.share_goal(uuid, uuid) to authenticated;

-- The owner stops sharing with p_friend, or a recipient removes a goal shared
-- with them (p_friend is ignored in that case).
create or replace function public.unshare_goal(p_goal_id uuid, p_friend uuid)
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
  delete from public.goal_shares s
  where s.goal_id = p_goal_id
    and ((s.owner_id = v_uid and s.shared_with_id = p_friend) or s.shared_with_id = v_uid);
end;
$$;
revoke all on function public.unshare_goal(uuid, uuid) from public, anon;
grant execute on function public.unshare_goal(uuid, uuid) to authenticated;

-- Goals shared with the caller (display fields only: no reminders, no habit
-- links). The share row's owner must still own the goal and still be connected.
create or replace function public.get_shared_goals()
returns table (
  id uuid, title text, goal_type text, target_value double precision,
  current_value double precision, unit text, deadline text, completed_at text,
  start_date text, owner_id uuid, owner_name text, owner_avatar text, shared_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.title, g.goal_type, g.target_value,
         public.goal_current_value(g.id),
         g.unit, g.deadline, g.completed_at, g.start_date,
         s.owner_id, p.display_name, p.avatar_url, s.created_at
  from public.goal_shares s
  join public.goals g
    on g.id = s.goal_id and g.user_id = s.owner_id and g.deleted_at is null
  left join public.profiles p on p.id = s.owner_id
  where s.shared_with_id = (select auth.uid())
    and public.are_connected(s.owner_id, s.shared_with_id)
  order by p.display_name nulls last, g.title
$$;
revoke all on function public.get_shared_goals() from public, anon;
grant execute on function public.get_shared_goals() to authenticated;

-- Everything the friend's goal screen needs, in one round trip: the goal (with
-- a fresh current value), its milestones, and its entry history (newest 2000)
-- with who added each one. added_by is resolved to the owner for the owner's
-- own rows (stored as NULL), so the client never has to guess.
create or replace function public.get_shared_goal_detail(p_goal_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select s.owner_id into v_owner
  from public.goal_shares s
  join public.goals g
    on g.id = s.goal_id and g.user_id = s.owner_id and g.deleted_at is null
  where s.goal_id = p_goal_id
    and s.shared_with_id = (select auth.uid())
    and public.are_connected(s.owner_id, s.shared_with_id);
  if v_owner is null then
    raise exception using message = 'ERK_NOT_SHARED';
  end if;

  return jsonb_build_object(
    'goal', (
      select jsonb_build_object(
        'id', g.id, 'title', g.title, 'goal_type', g.goal_type,
        'target_value', g.target_value, 'current_value', public.goal_current_value(g.id),
        'unit', g.unit, 'deadline', g.deadline, 'completed_at', g.completed_at,
        'start_date', g.start_date, 'owner_id', g.user_id,
        'owner_name', p.display_name, 'owner_avatar', p.avatar_url
      )
      from public.goals g
      left join public.profiles p on p.id = g.user_id
      where g.id = p_goal_id
    ),
    'milestones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'title', m.title, 'completed', m.completed, 'position', m.position,
        'amount', m.amount, 'due_date', m.due_date, 'updated_at', m.updated_at
      ) order by m.position)
      from public.goal_milestones m
      where m.goal_id = p_goal_id and m.deleted_at is null
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'amount', x.amount, 'updated_at', x.updated_at,
        'added_by', x.added_by, 'added_by_name', x.added_by_name
      ) order by x.updated_at desc)
      from (
        select e.id, e.amount, e.updated_at,
               coalesce(e.added_by, v_owner) as added_by,
               p.display_name as added_by_name
        from public.goal_entries e
        left join public.profiles p on p.id = coalesce(e.added_by, v_owner)
        where e.goal_id = p_goal_id and e.deleted_at is null
        order by e.updated_at desc
        limit 2000
      ) x
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_shared_goal_detail(uuid) from public, anon;
grant execute on function public.get_shared_goal_detail(uuid) to authenticated;

-- The friend's ONLY write path: appends a progress entry to a NUMERIC goal
-- shared with them. Expected failures are RETURNED (not raised), same contract
-- as the other sharing RPCs.
--   * A negative amount (a correction) may only undo the caller's OWN
--     contributions, never the owner's or another friend's progress.
--   * The goal never goes below zero (same floor as goalRepo.addProgress).
--   * At most 120 contributions per hour per user.
-- FOR UPDATE on the goal serializes concurrent contributions, so the floor and
-- the "own contributions" limit are computed on a consistent total.
create or replace function public.add_shared_goal_entry(p_goal_id uuid, p_amount double precision)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_goal uuid;
  v_type text;
  v_current double precision;
  v_mine double precision;
  v_applied double precision;
begin
  if v_uid is null then
    raise exception using message = 'ERK_AUTH';
  end if;

  select g.id, g.goal_type into v_goal, v_type
  from public.goals g
  join public.goal_shares s on s.goal_id = g.id and s.owner_id = g.user_id
  where g.id = p_goal_id
    and s.shared_with_id = v_uid
    and g.deleted_at is null
    and public.are_connected(g.user_id, v_uid)
  for update of g;
  if v_goal is null then
    return jsonb_build_object('error', 'ERK_NOT_SHARED');
  end if;
  -- Only a numeric goal takes amounts; NULL, zero, NaN and ±Infinity are
  -- rejected (NaN compares greater than every number in Postgres).
  if v_type <> 'numeric' or p_amount is null or p_amount = 0 or abs(p_amount) > 1e9 then
    return jsonb_build_object('error', 'ERK_INVALID_AMOUNT');
  end if;
  if (select count(*) from public.goal_entries e
      where e.added_by = v_uid and e.server_updated_at > now() - interval '1 hour') >= 120 then
    return jsonb_build_object('error', 'ERK_RATE_LIMITED');
  end if;

  v_current := public.goal_current_value(v_goal);
  if p_amount > 0 then
    v_applied := p_amount;
  else
    select coalesce(sum(e.amount), 0) into v_mine
    from public.goal_entries e
    where e.goal_id = v_goal and e.added_by = v_uid and e.deleted_at is null;
    v_applied := greatest(p_amount, -least(greatest(v_mine, 0), v_current));
    if v_applied = 0 then
      return jsonb_build_object('error', 'ERK_CORRECTION_LIMIT');
    end if;
  end if;

  insert into public.goal_entries (id, goal_id, amount, updated_at, deleted_at, added_by)
  values (gen_random_uuid(), v_goal, v_applied, now(), null, v_uid);

  return jsonb_build_object('applied', v_applied, 'current_value', v_current + v_applied);
end;
$$;
revoke all on function public.add_shared_goal_entry(uuid, double precision) from public, anon;
grant execute on function public.add_shared_goal_entry(uuid, double precision) to authenticated;

-- =============================================================================
-- FRIENDS / SHARING — PHASE 5: nudges ("remind your friend" as a push)
-- =============================================================================
-- A friend who can see a shared habit/goal can nudge its OWNER. The app never
-- sends a push itself: the send-nudge Edge Function (service role) calls
-- prepare_nudge(), which checks everything in one place and returns the
-- recipient's device tokens; the function hands them to Expo's push service.
--
-- Security model:
--   - push_tokens has RLS on and NO policy: no client can read any token, not
--     even its own. Written only through register/release below.
--   - A token belongs to ONE account. Registering it under another account
--     MOVES it (same phone, someone else signed in), so the previous account's
--     nudges stop reaching that phone even if its sign-out cleanup never got to
--     the server.
--   - release_push_token() works WITHOUT a session, by the token itself: the
--     device retries it after an offline sign-out. Tokens are never readable,
--     so knowing one means being that device.
--   - The push carries the item's title (shown after unlock). The Android
--     channel hides it on a locked screen (lockscreenVisibility PRIVATE), so the
--     lock screen shows only the system's "contents hidden" placeholder.
--   - Limits: 1 nudge per item per sender per 12 h, 20 per sender and 30 per
--     recipient per 24 h. Per-friend mute and a global opt-out are honoured
--     WITHOUT telling the sender (so muting can't be probed). Unfriending
--     revokes the shares, after which prepare_nudge refuses.
--   - Every table references auth.users ON DELETE CASCADE: delete_account()
--     also removes tokens, nudge history and mutes.

create table if not exists public.push_tokens (
  token text primary key check (char_length(token) between 10 and 200),
  user_id uuid not null references auth.users(id) on delete cascade,
  locale text not null default 'en' check (locale in ('tr', 'en', 'de')),
  updated_at timestamptz not null default now()
);
create index if not exists idx_push_tokens_user on public.push_tokens(user_id);

-- Kept only for the rate limits (pruned after 30 days in prepare_nudge).
create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  item_kind text not null check (item_kind in ('habit', 'goal')),
  item_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_nudges_sender on public.nudges(sender_id, created_at);
create index if not exists idx_nudges_recipient on public.nudges(recipient_id, created_at);
create index if not exists idx_nudges_created on public.nudges(created_at);

create table if not exists public.nudge_mutes (
  muter_id uuid not null references auth.users(id) on delete cascade,
  muted_id uuid not null references auth.users(id) on delete cascade,
  primary key (muter_id, muted_id)
);

-- Global "nudges from friends" switch. profiles stays self-read only (policy
-- above), so friends never see it.
alter table public.profiles add column if not exists nudges_enabled boolean not null default true;

alter table public.push_tokens enable row level security;
alter table public.nudges      enable row level security;
alter table public.nudge_mutes enable row level security;
-- No policies on any of the three: only the functions below touch them.

-- Expo push tokens look like "ExponentPushToken[...]" (newer: "ExpoPushToken[...]").
create or replace function public.register_push_token(p_token text, p_locale text)
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
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,180}\]$' then
    raise exception using message = 'ERK_INVALID_TOKEN';
  end if;
  insert into public.push_tokens (token, user_id, locale, updated_at)
  values (p_token, v_uid, case when p_locale in ('tr', 'en', 'de') then p_locale else 'en' end, now())
  on conflict (token) do update
    set user_id = excluded.user_id, locale = excluded.locale, updated_at = now();
  -- A handful of devices per account is plenty; the stalest ones drop out.
  delete from public.push_tokens t
  where t.user_id = v_uid
    and t.token not in (
      select t2.token from public.push_tokens t2
      where t2.user_id = v_uid
      order by t2.updated_at desc
      limit 10
    );
end;
$$;
revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

create or replace function public.release_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = p_token
$$;
revoke all on function public.release_push_token(text) from public;
grant execute on function public.release_push_token(text) to anon, authenticated;

create or replace function public.set_nudge_mute(p_friend uuid, p_muted boolean)
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
  if p_muted then
    insert into public.nudge_mutes (muter_id, muted_id)
    select v_uid, p_friend
    where public.are_connected(v_uid, p_friend)
    on conflict do nothing;
  else
    delete from public.nudge_mutes m where m.muter_id = v_uid and m.muted_id = p_friend;
  end if;
end;
$$;
revoke all on function public.set_nudge_mute(uuid, boolean) from public, anon;
grant execute on function public.set_nudge_mute(uuid, boolean) to authenticated;

create or replace function public.set_nudges_enabled(p_enabled boolean)
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
  update public.profiles set nudges_enabled = coalesce(p_enabled, true) where id = v_uid;
end;
$$;
revoke all on function public.set_nudges_enabled(boolean) from public, anon;
grant execute on function public.set_nudges_enabled(boolean) to authenticated;

-- The caller's own settings: the global switch and the friends they muted.
create or replace function public.get_nudge_prefs()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', coalesce((select p.nudges_enabled from public.profiles p where p.id = (select auth.uid())), true),
    'muted', coalesce((select jsonb_agg(m.muted_id) from public.nudge_mutes m
                       where m.muter_id = (select auth.uid())), '[]'::jsonb)
  )
$$;
revoke all on function public.get_nudge_prefs() from public, anon;
grant execute on function public.get_nudge_prefs() to authenticated;

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
  if v_owner is null or not public.are_connected(v_owner, p_sender) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  delete from public.nudges n where n.created_at < now() - interval '30 days';

  -- Limits are checked BEFORE recording: a refused attempt doesn't count.
  if exists (
    select 1 from public.nudges n
    where n.sender_id = p_sender and n.item_kind = p_kind and n.item_id = p_item_id
      and n.created_at > now() - interval '12 hours'
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

-- =============================================================================
-- FRIENDS / SHARING — PHASE 6: subtasks of a shared task
-- =============================================================================
-- A task shared with a friend now shows its subtasks too, and the friend can
-- tick them off (still nothing else: titles, order and deletion stay with the
-- owner). Same shape as the task itself (PHASE 3): the subtasks' SELECT policy
-- widens to the share so the friend's own sync pull receives them, writes stay
-- owner-only, and the friend's ONLY write path is toggle_shared_subtask().
--
-- Completion mirrors the owner's own rule (TaskEditModal): the parent task is
-- done when every subtask is done, and reopens when one is unticked — decided
-- here, in the same transaction, so both sides see one consistent result.

drop policy if exists "own subtasks" on public.subtasks;
drop policy if exists "subtasks select" on public.subtasks;
drop policy if exists "subtasks insert" on public.subtasks;
drop policy if exists "subtasks update" on public.subtasks;
drop policy if exists "subtasks delete" on public.subtasks;
create policy "subtasks select" on public.subtasks for select
  using (exists (
    select 1 from public.tasks t
    where t.id = subtasks.task_id
      and (
        t.user_id = (select auth.uid())
        or (t.shared_with_id = (select auth.uid()) and (select public.client_supports_sharing()))
      )
  ));
create policy "subtasks insert" on public.subtasks for insert
  with check (exists (
    select 1 from public.tasks t where t.id = subtasks.task_id and t.user_id = (select auth.uid())
  ));
create policy "subtasks update" on public.subtasks for update
  using (exists (
    select 1 from public.tasks t where t.id = subtasks.task_id and t.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.tasks t where t.id = subtasks.task_id and t.user_id = (select auth.uid())
  ));
create policy "subtasks delete" on public.subtasks for delete
  using (exists (
    select 1 from public.tasks t where t.id = subtasks.task_id and t.user_id = (select auth.uid())
  ));

-- Lost-update guard, like tasks_sharing_guard(): an owner's OFFLINE edit made
-- before the friend ticked a subtask must not undo that tick. Other columns
-- (title, position) still go through; completion keeps the newer value.
create or replace function public.subtasks_sharing_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at and exists (
       select 1 from public.tasks t where t.id = old.task_id and t.shared_with_id is not null) then
    new.completed := old.completed;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;
revoke all on function public.subtasks_sharing_guard() from public, anon, authenticated;

drop trigger if exists trg_subtasks_sharing_guard on public.subtasks;
create trigger trg_subtasks_sharing_guard
  before update on public.subtasks
  for each row execute function public.subtasks_sharing_guard();

-- Sync pulls are incremental (server_updated_at). Subtasks that existed BEFORE
-- the task was shared would never be pulled by the friend, so sharing touches
-- them: updated_at stays as it is (last-writer-wins is unaffected), only the
-- server timestamp moves.
create or replace function public.tasks_share_touch_subtasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shared_with_id is not null and new.shared_with_id is distinct from old.shared_with_id then
    update public.subtasks s set updated_at = s.updated_at where s.task_id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function public.tasks_share_touch_subtasks() from public, anon, authenticated;

drop trigger if exists trg_tasks_share_touch_subtasks on public.tasks;
create trigger trg_tasks_share_touch_subtasks
  after update of shared_with_id on public.tasks
  for each row execute function public.tasks_share_touch_subtasks();

-- The friend's ONLY way to tick a subtask. Returns the new state of the subtask
-- AND of its parent task (which may have completed/reopened with it).
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
    and t.shared_with_id = v_uid
    and t.deleted_at is null
    and t.recurrence is null
    and public.are_connected(t.user_id, v_uid)
  for update of s, t;
  if v_task is null then
    return jsonb_build_object('error', 'ERK_NOT_SHARED');
  end if;

  -- Strictly newer than the current row even if the owner's device clock runs
  -- ahead of the server, so the lost-update guard never eats this tick.
  update public.subtasks s
  set completed = v_completed,
      updated_at = greatest(now(), s.updated_at + interval '1 millisecond')
  where s.id = p_subtask_id
  returning s.updated_at into v_sub_updated;

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
    'subtask_updated_at', v_sub_updated,
    'task_id', v_task,
    'task_completed_at', v_task_completed_at,
    'task_updated_at', v_task_updated
  );
end;
$$;
revoke all on function public.toggle_shared_subtask(uuid, boolean) from public, anon;
grant execute on function public.toggle_shared_subtask(uuid, boolean) to authenticated;
