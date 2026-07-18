-- Habit App — Supabase şeması (anonim auth + RLS)
-- Supabase panelinde: SQL Editor > New query > bu dosyayı yapıştır > Run.
-- Ayrıca Authentication > Providers > "Anonymous sign-ins" AÇIK olmalı.
--
-- Tasarım: id'ler cihazda üretilen UUID. user_id = auth.uid() (anonim kullanıcı).
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
alter table public.habits add column if not exists kind          text not null default 'binary';
update public.habits set kind = 'numeric' where kind = 'binary' and target_amount is not null and target_amount > 0;

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

-- Hedefin 'Genel' sekmesinde serbest miktar girişiyle ("Ekle") eklenen kayıtların
-- günlüğü. Yalnızca görüntüleme içindir — goals.current_value tek doğru kaynak
-- olmaya devam eder, bu tablodan TÜRETİLMEZ.
create table if not exists public.goal_entries (
  id         uuid primary key,
  goal_id    uuid not null,
  amount     double precision not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

alter table public.habit_logs add column if not exists amount double precision not null default 0;

-- Senkron pull'u updated_at'e göre filtreler; indeksle.
create index if not exists idx_goals_updated  on public.goals(updated_at);
create index if not exists idx_habits_updated on public.habits(updated_at);
create index if not exists idx_tasks_updated  on public.tasks(updated_at);
create index if not exists idx_logs_updated   on public.habit_logs(updated_at);
create index if not exists idx_subtasks_updated on public.subtasks(updated_at);
create index if not exists idx_goal_milestones_updated on public.goal_milestones(updated_at);
create index if not exists idx_goal_entries_updated on public.goal_entries(updated_at);

-- ROW LEVEL SECURITY -------------------------------------------------------
alter table public.goals      enable row level security;
alter table public.habits     enable row level security;
alter table public.tasks      enable row level security;
alter table public.habit_logs enable row level security;
alter table public.subtasks   enable row level security;
alter table public.goal_milestones enable row level security;
alter table public.goal_entries enable row level security;

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

-- HESAP SİLME ---------------------------------------------------------------
-- Uygulama içi "Hesabı sil" (Google Play hesap-silme zorunluluğu). İstemci
-- kendi auth kullanıcısını doğrudan silemez (admin API service_role ister ve
-- istemciye konamaz). Bu SECURITY DEFINER fonksiyon, ÇAĞIRAN kullanıcının tüm
-- verisini ve auth kaydını sunucu tarafında tek işlemde siler. SQL editöründe
-- çalıştırıldığında sahibi postgres olur; auth.users'a erişim yetkisi oradan
-- gelir. auth.uid() kullanıldığı için bir kullanıcı yalnızca KENDİNİ silebilir.
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
