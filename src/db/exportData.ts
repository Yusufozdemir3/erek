// "Export my data": everything the user created, as one JSON document.
//
// Contains only the user's OWN, live data. Left out on purpose:
//   - deleted rows (tombstones) — the user deleted them;
//   - tasks other people shared WITH the user (shared_owner_uid set) — that's
//     someone else's data, and it's gone from the phone after sign-out anyway;
//   - sync bookkeeping and other people's cloud ids (synced, shared_with_id,
//     goal_entries.added_by) — internal, and a friend's id is not the user's to export.
// habit_logs has no deleted_at: logs of a deleted habit are skipped by joining
// on the live habits.

import { getDb } from './database';

export const EXPORT_FORMAT_VERSION = 1;

// Columns that never leave the device in an export.
const DROP = new Set(['synced', 'deleted_at', 'shared_with_id', 'shared_owner_uid', 'added_by']);

export interface ExportDocument {
  app: 'Erek';
  formatVersion: number;
  exportedAt: string; // ISO
  counts: Record<string, number>;
  habits: Row[];
  habitLogs: Row[];
  tasks: Row[];
  subtasks: Row[];
  tags: Row[];
  goals: Row[];
  goalMilestones: Row[];
  goalEntries: Row[];
  reminders: Row[];
}
type Row = Record<string, unknown>;

function clean(rows: Row[]): Row[] {
  return rows.map((r) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(r)) if (!DROP.has(k)) out[k] = v;
    return out;
  });
}

export function buildExport(userId: string, now: Date = new Date()): ExportDocument {
  const db = getDb();
  const q = (sql: string, ...args: string[]) => clean(db.getAllSync<Row>(sql, args));

  const habits = q(`SELECT * FROM habits WHERE user_id = ? AND deleted_at IS NULL ORDER BY title`, userId);
  const tasks = q(
    `SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL AND shared_owner_uid IS NULL ORDER BY due_date, title`,
    userId
  );
  const goals = q(`SELECT * FROM goals WHERE user_id = ? AND deleted_at IS NULL ORDER BY title`, userId);
  const tags = q(`SELECT * FROM tags WHERE user_id = ? AND deleted_at IS NULL ORDER BY position`, userId);

  const habitLogs = q(
    `SELECT l.* FROM habit_logs l JOIN habits h ON h.id = l.habit_id
     WHERE h.user_id = ? AND h.deleted_at IS NULL ORDER BY l.log_date, l.habit_id`,
    userId
  );
  const subtasks = q(
    `SELECT s.* FROM subtasks s JOIN tasks t ON t.id = s.task_id
     WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.shared_owner_uid IS NULL AND s.deleted_at IS NULL
     ORDER BY s.task_id, s.position`,
    userId
  );
  const goalMilestones = q(
    `SELECT m.* FROM goal_milestones m JOIN goals g ON g.id = m.goal_id
     WHERE g.user_id = ? AND g.deleted_at IS NULL AND m.deleted_at IS NULL ORDER BY m.goal_id, m.position`,
    userId
  );
  const goalEntries = q(
    `SELECT e.* FROM goal_entries e JOIN goals g ON g.id = e.goal_id
     WHERE g.user_id = ? AND g.deleted_at IS NULL AND e.deleted_at IS NULL ORDER BY e.goal_id, e.updated_at`,
    userId
  );
  const reminders = q(
    `SELECT r.* FROM reminders r WHERE r.deleted_at IS NULL AND (
       (r.entity_type = 'habit' AND r.entity_id IN (SELECT id FROM habits WHERE user_id = ? AND deleted_at IS NULL)) OR
       (r.entity_type = 'task'  AND r.entity_id IN (SELECT id FROM tasks  WHERE user_id = ? AND deleted_at IS NULL AND shared_owner_uid IS NULL)) OR
       (r.entity_type = 'goal'  AND r.entity_id IN (SELECT id FROM goals  WHERE user_id = ? AND deleted_at IS NULL))
     ) ORDER BY r.entity_type, r.entity_id, r.time`,
    userId,
    userId,
    userId
  );

  return {
    app: 'Erek',
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    counts: {
      habits: habits.length,
      habitLogs: habitLogs.length,
      tasks: tasks.length,
      subtasks: subtasks.length,
      tags: tags.length,
      goals: goals.length,
      goalMilestones: goalMilestones.length,
      goalEntries: goalEntries.length,
      reminders: reminders.length,
    },
    habits,
    habitLogs,
    tasks,
    subtasks,
    tags,
    goals,
    goalMilestones,
    goalEntries,
    reminders,
  };
}
