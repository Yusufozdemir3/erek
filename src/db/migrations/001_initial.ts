// Migration 001: initial schema.
// Every table has fields critical for offline-first:
//   updated_at  -> "last writer wins" conflict resolution
//   deleted_at  -> soft delete (a deleted record is flagged, never actually removed)
//   synced      -> 0 means it's still waiting to be pushed to the cloud
//
// IDs are TEXT (UUID) because a device must be able to generate a record while
// offline, and that ID must never collide with records in the cloud.

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

// Migration 002: sync flag on habit_logs.
// habit_logs didn't carry `synced` in the original schema; for cloud sync
// every log also needs to track "is this waiting to be sent". Existing logs
// start at synced=0 so they get pushed to the cloud on the first sync.
export const migration002 = `
ALTER TABLE habit_logs ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;
`;

// Migration 003: visual identity for habits (emoji icon + color).
// Both optional (NULL) — existing habits keep the default look.
export const migration003 = `
ALTER TABLE habits ADD COLUMN icon  TEXT;
ALTER TABLE habits ADD COLUMN color TEXT;
`;

// Migration 004: recurrence/frequency rule (schedule) for habits.
// JSON (Recurrence) or NULL. NULL = every day (existing behavior, backward compatible).
export const migration004 = `
ALTER TABLE habits ADD COLUMN schedule TEXT;
`;

// Migration 005: quantitative tracking. Adds a daily target (target_amount) +
// unit to habits; adds the amount done that day (amount) to habit_logs.
// target_amount NULL = binary habit.
export const migration005 = `
ALTER TABLE habits ADD COLUMN target_amount REAL;
ALTER TABLE habits ADD COLUMN unit TEXT;
ALTER TABLE habit_logs ADD COLUMN amount REAL NOT NULL DEFAULT 0;
`;

// Migration 006: habit lifespan. Before start_date and after end_date, a habit
// isn't considered "scheduled" (invisible, doesn't affect streaks). Both can
// be NULL: NULL start = since the beginning, NULL end = indefinite (existing behavior).
export const migration006 = `
ALTER TABLE habits ADD COLUMN start_date TEXT;
ALTER TABLE habits ADD COLUMN end_date TEXT;
`;

// Migration 007: subtasks (a simple checklist). No date/priority of their
// own — just a title + completed. position = creation order (can't use
// updated_at for ordering since toggling changes it). Sync fields follow the
// same pattern as the other tables (updated_at LWW + soft delete + synced flag).
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

// Migration 008: habit type (kind). 'binary' (did/didn't) | 'numeric' (an
// amount target) | 'timer' (countdown: target_amount = target SECONDS,
// habit_logs.amount = accumulated seconds that day; completed once amount >= target).
// Existing habits are stamped retroactively: 'numeric' if target_amount>0,
// otherwise 'binary' (the default). This preserves the old behavior exactly.
export const migration008 = `
ALTER TABLE habits ADD COLUMN kind TEXT NOT NULL DEFAULT 'binary';
UPDATE habits SET kind = 'numeric' WHERE target_amount IS NOT NULL AND target_amount > 0;
`;

// Migration 009: end time for a task. due_date embeds the start/due time;
// end_time holds that same day's end time as "HH:MM" (same day). NULL = no
// end time (existing behavior). Only meaningful when there's already a start time.
export const migration009 = `
ALTER TABLE tasks ADD COLUMN end_time TEXT;
`;

// Migration 010: contribution shape toward a linked goal. goal_contribution
// NULL/'per_completion' (existing behavior: +1 per completed day) | 'amount'
// (that day's amount × goal_factor is added to the goal — for a unit
// mismatch the user sets their own multiplier, e.g. 1 cup = 0.25 liters).
// goal_factor defaults to 1 (untouched when the units already match). Only
// meaningful for a numeric/timer habit linked to a goal; a binary habit has no
// concept of "amount", it's always treated as per_completion.
export const migration010 = `
ALTER TABLE habits ADD COLUMN goal_contribution TEXT;
ALTER TABLE habits ADD COLUMN goal_factor REAL NOT NULL DEFAULT 1;
`;

// Migration 011: goals reshaped. The 'deadline' type stops being its own type
// — NOW EVERY goal (including numeric) can have a deadline (the deadline
// column already existed, it was just used only by one type). goal_type's
// second value becomes 'milestone' (identical logic to task/subtask: a goal
// that can be broken into parts/steps). Existing 'deadline'-type records are
// converted to 'milestone' — no data loss since deadline values were already populated.
// completed_at: only ever set manually/automatically (once all milestones are
// done) for 'milestone' goals. A 'numeric' goal still derives completion from
// current_value >= target_value (untouched, completed_at always stays NULL).
// goal_milestones: the exact same pattern as subtasks (title+completed+position).
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

// Migration 012: goal entry history. When the user types a free-form amount on
// the goal's 'Overview' tab and taps "Add", current_value is already updated
// (goalRepo.addProgress); this table ONLY logs "how much was added when" so
// the user can see their history — current_value is NEVER derived from this
// table (the single source of truth is goals.current_value). Same exact
// pattern as goal_milestones (updated_at doubles as both creation and deletion
// timestamp, plus deleted_at + synced).
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

// Migration 013: amount + due date for goal milestones, reminder time for goals.
// goal_milestones.amount: for NUMERIC goals a milestone is a "threshold" — its
// percentage is derived CUMULATIVELY from the goal's current_value (milestones
// fill in order), never checked off manually (see
// goalMilestoneRepo.milestoneViews). For 'milestone'-type goals, amount stays
// NULL and the checkbox behavior is unchanged.
// goal_milestones.due_date: an optional milestone due date, for both types.
// goals.remind_at: "HH:MM" — a daily entry reminder for the goal (the same
// pattern as habits.remind_at; see notifications.scheduleGoalReminder).
export const migration013 = `
ALTER TABLE goal_milestones ADD COLUMN amount REAL;
ALTER TABLE goal_milestones ADD COLUMN due_date TEXT;
ALTER TABLE goals ADD COLUMN remind_at TEXT;
`;

// Migration 014: a SEPARATE reminder time for tasks (tasks.remind_at "HH:MM").
// Task reminders used to be implicit: if a time was embedded in due_date, a
// notification was scheduled at that time — there was no separate control.
// Now the reminder is explicitly set via remind_at (the habits.remind_at
// pattern) and is INDEPENDENT of the due date's own time (a task can be due at
// 14:00 but remind at 09:00). due_date's time is now purely for display/
// sorting (TimeBadge, DUE_ORDER_SQL); it no longer drives the notification.
// BACKWARD COMPAT: existing tasks with a time used to get notified at that
// embedded time, so remind_at is backfilled with that same time — their
// reminders shouldn't get cut off.
export const migration014 = `
ALTER TABLE tasks ADD COLUMN remind_at TEXT;
UPDATE tasks SET remind_at = substr(due_date, 12, 5)
  WHERE due_date IS NOT NULL AND length(due_date) > 10;
`;

// Migration 015: an EXPLICIT start date for goals (goals.start_date "YYYY-MM-DD").
// "Days elapsed" (daysElapsed, goalProjection.ts) used to be derived from the
// date of the FIRST entry — if you created a goal today and added 3 entries
// today, daysElapsed comes out 0/1, but since avgDaily always divides
// last7Total by 7 (even days that haven't happened yet count in the
// denominator), the daily pace would look artificially small (3
// entries/day instead of 3/7≈0.4). Now start_date is an explicit field: new
// goals are stamped with today on creation (goalRepo.create), and avgDaily's
// window is bounded by the ACTUAL number of days lived (see
// goalProjection.ts). Existing goals start at NULL — backfilled with their
// earliest entry's date if one exists (otherwise stays NULL; goalProjection
// already produces nothing for an entry-less goal anyway).
export const migration015 = `
ALTER TABLE goals ADD COLUMN start_date TEXT;
UPDATE goals SET start_date = (
  SELECT MIN(substr(updated_at, 1, 10)) FROM goal_entries WHERE goal_entries.goal_id = goals.id
) WHERE start_date IS NULL;
`;

// Migration 016: multiple reminders. Instead of a single habits/tasks/
// goals.remind_at ("HH:MM"), an entity can now have ZERO OR MORE reminder
// times, via a separate reminders table (same pattern as subtasks/
// goal_milestones; ownership via entity_type+entity_id rather than a parent
// table, standing on its own — see supabase/schema.sql). Every record that had
// an old remind_at value gets exactly ONE row backfilled (no data loss); the
// remind_at columns stay in the DB but are no longer read/written by any code
// (see notifications.ts).
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

// Migration 017: converts the reminder IDs produced by migration016 into the
// canonical UUID format. Problem: `lower(hex(randomblob(16)))` produces a
// 32-character DASH-LESS string; Supabase's reminders.id is a `uuid` column —
// it accepts it on push but returns it in the DASHED canonical form on pull.
// When the dashed ID isn't found locally, the same reminder gets inserted as a
// SECOND row and the notification fired twice. (As a second line of defense on
// the sync side, reminders were also given a naturalKey; see src/sync/syncEngine.ts.)
//
// synced=0: the corrected row gets re-pushed on the next round. Since the
// cloud already holds the canonical form, this upsert lands on the same row (no duplicate produced).
export const migration017 = `
UPDATE reminders
SET id = substr(id, 1, 8) || '-' || substr(id, 9, 4) || '-' || substr(id, 13, 4)
         || '-' || substr(id, 17, 4) || '-' || substr(id, 21, 12),
    synced = 0
WHERE length(id) = 32 AND id NOT LIKE '%-%';
`;

// Migration 018: goal_contribution/goal_factor never made it to the cloud AT ALL.
// Problem: the two columns were added to the local schema in migration010, but
// never added to the sync engine's habits column list (src/sync/syncEngine.ts)
// or the cloud schema (supabase/schema.sql). The result was silent: on the
// device that set up the habit, "4 cups = 1 liter" worked correctly, but the
// row landing on a SECOND device on the same account came down with
// goal_contribution=NULL, goal_factor=1 (the SQLite DEFAULT). Checking off the
// habit on that device wrote +1 to the goal instead of 0.25, and if the habit
// ever got edited there, the wrong value would get carried BACK to the FIRST
// device via LWW, overwriting the correct setting.
//
// NO schema change here — the columns already exist locally. All this does is
// make sure these now-synced fields also go out to the cloud for existing
// rows: rows that stayed synced=1 would otherwise never be pushed again, i.e.
// the fix would only apply to habits CHANGED from now on. The habits table is
// small, so re-queuing all of them is a negligible cost.
//
// NOTE: supabase/schema.sql must be re-run BEFORE this version ships (that's
// where the two columns' cloud counterparts live). Otherwise the push fails
// with "Could not find the 'goal_contribution' column" — syncEngine.schemaHint
// tells the user what to do in that case.
export const migration018 = `
UPDATE habits SET synced = 0;
`;

// Migration 019: goal progress is now DERIVED — so it doesn't get lost across
// multiple devices.
//
// PROBLEM: goals.current_value was a plain column carried by sync with
// last-writer-wins. goal_entries, on the other hand, is an APPEND-ONLY table
// and each row syncs independently. If device A enters +5 km and device B
// enters +3 km, both ENTRIES reach each device, but current_value only picked
// up whichever device synced last: the user would see both "5 / 100 km" AND
// the "+5 km, +3 km" history on the same screen, with the 3 km silently
// disappearing.
//
// FIX: current_value = value_baseline + (sum of active entries), 0-based.
//   - ENTRIES are additive and sync by their own ids -> two devices'
//     contributions MERGE without conflict (no side gets lost).
//   - value_baseline holds everything NOT represented by entries: the
//     accumulated value from before this migration, plus the user manually
//     editing "Current value". This field stays last-writer-wins, and
//     correctly so: an explicit manual overwrite already means "let the last
//     writer win".
//   - current_value REMAINS a column (a cache): every reader (list cards,
//     stats, threshold milestones, projection) keeps working unchanged.
//
// BACKWARD COMPAT: baseline is backfilled by subtracting the sum of entries
// from the current value. So this migration does NOT change any goal's
// visible value — it only splits the same number into two pieces that can
// merge from now on. For an old goal with no entries, baseline simply equals the current value.
//
// synced=0: goals are re-sent once so the new column reaches the cloud.
export const migration019 = `
ALTER TABLE goals ADD COLUMN value_baseline REAL NOT NULL DEFAULT 0;
UPDATE goals SET value_baseline = current_value - COALESCE((
  SELECT SUM(amount) FROM goal_entries
   WHERE goal_entries.goal_id = goals.id AND goal_entries.deleted_at IS NULL
), 0);
UPDATE goals SET synced = 0;
`;

// Migration list - runs in order. A new schema change = a new element.
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
];
