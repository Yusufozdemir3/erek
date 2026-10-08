// Migration 001: initial schema. Every table carries the offline-first fields:
//   updated_at -> last-writer-wins
//   deleted_at -> soft delete (flagged, never removed)
//   synced     -> 0 = still waiting to be pushed
// Ids are TEXT UUIDs so records created offline never collide in the cloud.

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
  recurrence   TEXT,                       -- JSON string or NULL
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
  goal_id    TEXT,                         -- can be linked to a goal later
  title      TEXT NOT NULL,
  remind_at  TEXT,                         -- e.g. "08:30"
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  synced     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (goal_id) REFERENCES goals(id)
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id         TEXT PRIMARY KEY NOT NULL,
  habit_id   TEXT NOT NULL,
  log_date   TEXT NOT NULL,                -- e.g. "2026-06-28"
  completed  INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (habit_id) REFERENCES habits(id),
  UNIQUE (habit_id, log_date)              -- one record per day
);

-- Indexes for frequent queries
CREATE INDEX IF NOT EXISTS idx_tasks_user     ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due      ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_habits_user    ON habits(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_habit     ON habit_logs(habit_id);
CREATE INDEX IF NOT EXISTS idx_logs_date      ON habit_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_goals_user     ON goals(user_id);
`;

// Migration 002: habit_logs gets `synced` too; existing logs start unsynced.
export const migration002 = `
ALTER TABLE habit_logs ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;
`;

// Migration 003: optional habit icon + color.
export const migration003 = `
ALTER TABLE habits ADD COLUMN icon  TEXT;
ALTER TABLE habits ADD COLUMN color TEXT;
`;

// Migration 004: habit schedule — JSON Recurrence, NULL = every day.
export const migration004 = `
ALTER TABLE habits ADD COLUMN schedule TEXT;
`;

// Migration 005: quantitative habits — daily target_amount + unit on habits,
// the day's amount on habit_logs.
export const migration005 = `
ALTER TABLE habits ADD COLUMN target_amount REAL;
ALTER TABLE habits ADD COLUMN unit TEXT;
ALTER TABLE habit_logs ADD COLUMN amount REAL NOT NULL DEFAULT 0;
`;

// Migration 006: habit lifespan. Outside [start_date, end_date] a habit isn't
// scheduled (hidden, streak untouched). NULL = unbounded on that side.
export const migration006 = `
ALTER TABLE habits ADD COLUMN start_date TEXT;
ALTER TABLE habits ADD COLUMN end_date TEXT;
`;

// Migration 007: subtasks — a plain checklist. position = creation order
// (updated_at changes on every toggle, so it can't order them).
export const migration007 = `
CREATE TABLE IF NOT EXISTS subtasks (
  id         TEXT PRIMARY KEY NOT NULL,
  task_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  completed  INTEGER NOT NULL DEFAULT 0,
  position   INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  synced     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
`;

// Migration 008: habit kind — 'binary' | 'numeric' | 'timer' (target_amount =
// target SECONDS, the log's amount = seconds done that day). Existing habits:
// 'numeric' when they have a target, else 'binary'.
export const migration008 = `
ALTER TABLE habits ADD COLUMN kind TEXT NOT NULL DEFAULT 'binary';
UPDATE habits SET kind = 'numeric' WHERE target_amount IS NOT NULL AND target_amount > 0;
`;

// Migration 009: a task's end time ("HH:MM", same day as the time in due_date).
export const migration009 = `
ALTER TABLE tasks ADD COLUMN end_time TEXT;
`;

// Migration 010: how a linked habit feeds its goal. goal_contribution
// NULL/'per_completion' = +1 per completed day; 'amount' = the day's amount ×
// goal_factor (e.g. 1 cup = 0.25 liters). Binary habits are always per_completion.
export const migration010 = `
ALTER TABLE habits ADD COLUMN goal_contribution TEXT;
ALTER TABLE habits ADD COLUMN goal_factor REAL NOT NULL DEFAULT 1;
`;

// Migration 011: every goal may have a deadline; the old 'deadline' type
// becomes 'milestone' (a goal split into steps, stored in goal_milestones like
// subtasks). completed_at is used by 'milestone' goals only; a numeric goal is
// done when current_value >= target_value.
export const migration011 = `
ALTER TABLE goals ADD COLUMN completed_at TEXT;
UPDATE goals SET goal_type = 'milestone' WHERE goal_type = 'deadline';
CREATE TABLE IF NOT EXISTS goal_milestones (
  id         TEXT PRIMARY KEY NOT NULL,
  goal_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  completed  INTEGER NOT NULL DEFAULT 0,
  position   INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  synced     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (goal_id) REFERENCES goals(id)
);
CREATE INDEX IF NOT EXISTS idx_goal_milestones_goal ON goal_milestones(goal_id);
`;

// Migration 012: goal entries — each progress amount added to a goal (since
// migration 019, current_value is derived from them).
export const migration012 = `
CREATE TABLE IF NOT EXISTS goal_entries (
  id         TEXT PRIMARY KEY NOT NULL,
  goal_id    TEXT NOT NULL,
  amount     REAL NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  synced     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (goal_id) REFERENCES goals(id)
);
CREATE INDEX IF NOT EXISTS idx_goal_entries_goal ON goal_entries(goal_id);
`;

// Migration 013: goal_milestones.amount (on numeric goals a threshold that
// fills from current_value, never ticked by hand) and due_date; goals.remind_at.
export const migration013 = `
ALTER TABLE goal_milestones ADD COLUMN amount REAL;
ALTER TABLE goal_milestones ADD COLUMN due_date TEXT;
ALTER TABLE goals ADD COLUMN remind_at TEXT;
`;

// Migration 014: tasks.remind_at, independent of the time in due_date (due at
// 14:00, remind at 09:00). Tasks with a time used to be notified at it, so
// that time is copied over.
export const migration014 = `
ALTER TABLE tasks ADD COLUMN remind_at TEXT;
UPDATE tasks SET remind_at = substr(due_date, 12, 5)
  WHERE due_date IS NOT NULL AND length(due_date) > 10;
`;

// Migration 015: goals.start_date, so the daily pace divides by the days
// actually lived (goalProjection.ts). Existing goals take their first entry's date.
export const migration015 = `
ALTER TABLE goals ADD COLUMN start_date TEXT;
UPDATE goals SET start_date = (
  SELECT MIN(substr(updated_at, 1, 10)) FROM goal_entries WHERE goal_entries.goal_id = goals.id
) WHERE start_date IS NULL;
`;

// Migration 016: any number of reminders per habit/task/goal, in a reminders
// table keyed by entity_type + entity_id. Each old remind_at becomes one row;
// the remind_at columns stay but are no longer used.
export const migration016 = `
CREATE TABLE IF NOT EXISTS reminders (
  id          TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  time        TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  synced      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reminders_entity ON reminders(entity_type, entity_id);

INSERT INTO reminders (id, entity_type, entity_id, time, updated_at, deleted_at, synced)
SELECT lower(hex(randomblob(16))), 'habit', id, remind_at, updated_at, NULL, 0
FROM habits WHERE remind_at IS NOT NULL;

INSERT INTO reminders (id, entity_type, entity_id, time, updated_at, deleted_at, synced)
SELECT lower(hex(randomblob(16))), 'task', id, remind_at, updated_at, NULL, 0
FROM tasks WHERE remind_at IS NOT NULL;

INSERT INTO reminders (id, entity_type, entity_id, time, updated_at, deleted_at, synced)
SELECT lower(hex(randomblob(16))), 'goal', id, remind_at, updated_at, NULL, 0
FROM goals WHERE remind_at IS NOT NULL;
`;

// Migration 017: migration016's ids were dashless hex, but Postgres' uuid
// column returns them dashed, so pull inserted a second copy. Rewrite them in
// canonical form; the re-push lands on the same cloud row.
export const migration017 = `
UPDATE reminders
SET id = substr(id, 1, 8) || '-' || substr(id, 9, 4) || '-' || substr(id, 13, 4)
         || '-' || substr(id, 17, 4) || '-' || substr(id, 21, 12),
    synced = 0
WHERE length(id) = 32 AND id NOT LIKE '%-%';
`;

// Migration 018: goal_contribution/goal_factor joined sync late, so every habit
// is queued once more to carry them to the cloud (no schema change).
export const migration018 = `
UPDATE habits SET synced = 0;
`;

// Migration 019: goal progress becomes derived so devices can't overwrite each
// other's entries: current_value = value_baseline + sum of live entries.
// Entries merge row by row; value_baseline (pre-existing progress and manual
// "Current value" edits) stays last-writer-wins; current_value remains as a
// cache. The backfill keeps every goal's visible value unchanged.
export const migration019 = `
ALTER TABLE goals ADD COLUMN value_baseline REAL NOT NULL DEFAULT 0;
UPDATE goals SET value_baseline = current_value - COALESCE((
  SELECT SUM(amount) FROM goal_entries
   WHERE goal_entries.goal_id = goals.id AND goal_entries.deleted_at IS NULL
), 0);
UPDATE goals SET synced = 0;
`;

// Migration 020: shared tasks.
//   shared_with_id   — synced; the friend's raw cloud uid.
//   shared_owner_uid — local only; set on a task someone shared WITH me
//                      (never pushed or edited locally).
export const migration020 = `
ALTER TABLE tasks ADD COLUMN shared_with_id TEXT;
ALTER TABLE tasks ADD COLUMN shared_owner_uid TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_shared_owner ON tasks(shared_owner_uid) WHERE shared_owner_uid IS NOT NULL;
`;

// Migration 021: goal_entries.added_by — the raw cloud uid of a friend who
// added to my shared goal; NULL = me.
export const migration021 = `
ALTER TABLE goal_entries ADD COLUMN added_by TEXT;
`;

// Migration 022: rest days — habits.skip_dates, a JSON array of days that count
// as unscheduled (no broken streak, no lower rate).
export const migration022 = `
ALTER TABLE habits ADD COLUMN skip_dates TEXT;
`;

// Migration 023: task icons and user-made tags. tasks.icon = an icon id
// (ui/taskIcons); tasks.tag_ids = a JSON array of tag ids. The tags travel
// inside the task row (no join table) so they sync with it, last writer wins.
// A deleted tag's id may linger in tag_ids; readers skip unknown ids.
export const migration023 = `
ALTER TABLE tasks ADD COLUMN icon TEXT;
ALTER TABLE tasks ADD COLUMN tag_ids TEXT;

CREATE TABLE IF NOT EXISTS tags (
  id         TEXT PRIMARY KEY NOT NULL,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  color      TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  synced     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id);
`;

// Applied in order; a schema change = a new element.
export const migrations = [
  { version: 1, sql: migration001 },
  { version: 2, sql: migration002 },
  { version: 3, sql: migration003 },
  { version: 4, sql: migration004 },
  { version: 5, sql: migration005 },
  { version: 6, sql: migration006 },
  { version: 7, sql: migration007 },
  { version: 8, sql: migration008 },
  { version: 9, sql: migration009 },
  { version: 10, sql: migration010 },
  { version: 11, sql: migration011 },
  { version: 12, sql: migration012 },
  { version: 13, sql: migration013 },
  { version: 14, sql: migration014 },
  { version: 15, sql: migration015 },
  { version: 16, sql: migration016 },
  { version: 17, sql: migration017 },
  { version: 18, sql: migration018 },
  { version: 19, sql: migration019 },
  { version: 20, sql: migration020 },
  { version: 21, sql: migration021 },
  { version: 22, sql: migration022 },
  { version: 23, sql: migration023 },
];
