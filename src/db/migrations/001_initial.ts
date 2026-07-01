// Migration 001: İlk şema.
// Her tabloda offline-first için kritik alanlar:
//   updated_at  -> "son yazan kazanır" çakışma çözümü
//   deleted_at  -> soft delete (silinen kayıt işaretlenir, gerçekten silinmez)
//   synced      -> 0 ise buluta gönderilmeyi bekliyor
//
// ID'ler TEXT (UUID) çünkü cihaz internetsizken kayıt üretebilmeli
// ve bu ID buluttaki kayıtlarla çakışmamalı.

export const migration001 = `
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY NOT NULL,
  email        TEXT,
  is_anonymous INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT,
  synced       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY NOT NULL,
  user_id      TEXT NOT NULL,
  title        TEXT NOT NULL,
  due_date     TEXT,
  priority     TEXT NOT NULL DEFAULT 'medium',
  recurrence   TEXT,                       -- JSON string ya da NULL
  completed_at TEXT,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT,
  synced       INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS goals (
  id            TEXT PRIMARY KEY NOT NULL,
  user_id       TEXT NOT NULL,
  title         TEXT NOT NULL,
  goal_type     TEXT NOT NULL,             -- 'numeric' | 'deadline'
  target_value  REAL,
  current_value REAL NOT NULL DEFAULT 0,
  unit          TEXT,
  deadline      TEXT,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  synced        INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS habits (
  id         TEXT PRIMARY KEY NOT NULL,
  user_id    TEXT NOT NULL,
  goal_id    TEXT,                         -- ileride bir hedefe bağlanabilir
  title      TEXT NOT NULL,
  remind_at  TEXT,                         -- "08:30" gibi
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  synced     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (goal_id) REFERENCES goals(id)
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id         TEXT PRIMARY KEY NOT NULL,
  habit_id   TEXT NOT NULL,
  log_date   TEXT NOT NULL,                -- "2026-06-28"
  completed  INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (habit_id) REFERENCES habits(id),
  UNIQUE (habit_id, log_date)              -- bir gün için tek kayıt
);

-- Sık yapılan sorgular için indeksler
CREATE INDEX IF NOT EXISTS idx_tasks_user     ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due      ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_habits_user    ON habits(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_habit     ON habit_logs(habit_id);
CREATE INDEX IF NOT EXISTS idx_logs_date      ON habit_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_goals_user     ON goals(user_id);
`;

// Migration 002: habit_logs'a senkron bayrağı.
// habit_logs ilk şemada synced taşımıyordu; bulut senkronu için her log da
// "gönderilmeyi bekliyor mu" bilgisini tutmalı. Mevcut loglar synced=0 başlar
// ki ilk senkronda buluta gönderilsinler.
export const migration002 = `
ALTER TABLE habit_logs ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;
`;

// Migration 003: alışkanlıklara görsel kimlik (emoji ikon + renk).
// İkisi de opsiyonel (NULL) — mevcut alışkanlıklar varsayılan görünümde kalır.
export const migration003 = `
ALTER TABLE habits ADD COLUMN icon  TEXT;
ALTER TABLE habits ADD COLUMN color TEXT;
`;

// Migration 004: alışkanlıklara sıklık/tekrar kuralı (schedule).
// JSON (Recurrence) ya da NULL. NULL = her gün (mevcut davranış, geriye uyumlu).
export const migration004 = `
ALTER TABLE habits ADD COLUMN schedule TEXT;
`;

// Migration listesi - sırayla çalışır. Yeni şema değişikliği = yeni eleman.
export const migrations = [
  { version: 1, sql: migration001 },
  { version: 2, sql: migration002 },
  { version: 3, sql: migration003 },
  { version: 4, sql: migration004 },
];
