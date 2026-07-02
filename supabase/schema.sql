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
  goal_type     text not null,
  target_value  double precision,
  current_value double precision not null default 0,
  unit          text,
  deadline      text,
  updated_at    timestamptz not null,
  deleted_at    timestamptz
);

create table if not exists public.habits (
  id         uuid primary key,
  user_id    uuid not null,
  goal_id    uuid,
  title         text not null,
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

create table if not exists public.tasks (
  id           uuid primary key,
  user_id      uuid not null,
  title        text not null,
  due_date     text,
  priority     text not null default 'medium',
  recurrence   text,
  completed_at text,
  updated_at   timestamptz not null,
  deleted_at   timestamptz
);

create table if not exists public.habit_logs (
  id         uuid primary key,
  habit_id   uuid not null,
  log_date   text not null,
  completed  integer not null default 0,
  amount     double precision not null default 0,
  updated_at timestamptz not null
);

alter table public.habit_logs add column if not exists amount double precision not null default 0;

-- Senkron pull'u updated_at'e göre filtreler; indeksle.
create index if not exists idx_goals_updated  on public.goals(updated_at);
create index if not exists idx_habits_updated on public.habits(updated_at);
create index if not exists idx_tasks_updated  on public.tasks(updated_at);
create index if not exists idx_logs_updated   on public.habit_logs(updated_at);

-- ROW LEVEL SECURITY -------------------------------------------------------
alter table public.goals      enable row level security;
alter table public.habits     enable row level security;
alter table public.tasks      enable row level security;
alter table public.habit_logs enable row level security;

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
