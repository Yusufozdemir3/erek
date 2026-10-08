// Purges old "tombstones". Deletion is soft (deleted_at) because that's how a
// deletion reaches other devices, but the rows otherwise pile up forever —
// reminders fastest, since each edited time leaves one behind.
//
// A tombstone is deleted only when (a) old enough AND (b) already pushed
// (synced = 1); otherwise an undelivered deletion would vanish and the record
// come back from another device.
//
// Foreign keys are on: leaf tables first, then parents nothing points at
// anymore (so a parent freed in the same pass goes too). habit_logs has no
// deleted_at, so a deleted habit with logs is kept — deleting the logs would
// only bring them back on the next full pull.

import { getDb } from './database';

/** How long a tombstone must age before it can be deleted. */
export const TOMBSTONE_TTL_DAYS = 90;

// Leaf tables: no other table points at them.
// tags too: tasks point at them only inside a JSON list, which skips unknown ids.
const LEAF_TABLES = ['subtasks', 'goal_milestones', 'goal_entries', 'reminders', 'tags'];

// Parent tables and their "nothing points at me" guards.
const PARENT_TABLES: { table: string; guards: string[] }[] = [
  {
    table: 'tasks',
    guards: [
      `NOT EXISTS (SELECT 1 FROM subtasks s WHERE s.task_id = tasks.id)`,
      `NOT EXISTS (SELECT 1 FROM reminders r WHERE r.entity_type = 'task' AND r.entity_id = tasks.id)`,
    ],
  },
  {
    table: 'habits',
    guards: [
      `NOT EXISTS (SELECT 1 FROM habit_logs l WHERE l.habit_id = habits.id)`,
      `NOT EXISTS (SELECT 1 FROM reminders r WHERE r.entity_type = 'habit' AND r.entity_id = habits.id)`,
    ],
  },
  {
    table: 'goals',
    guards: [
      `NOT EXISTS (SELECT 1 FROM habits h WHERE h.goal_id = goals.id)`,
      `NOT EXISTS (SELECT 1 FROM goal_milestones m WHERE m.goal_id = goals.id)`,
      `NOT EXISTS (SELECT 1 FROM goal_entries e WHERE e.goal_id = goals.id)`,
      `NOT EXISTS (SELECT 1 FROM reminders r WHERE r.entity_type = 'goal' AND r.entity_id = goals.id)`,
    ],
  },
];

function cutoffIso(days: number, now: number): string {
  return new Date(now - days * 86_400_000).toISOString();
}

/** Deletes expired, already-pushed tombstones; returns how many. */
export function purgeOldTombstones(
  ttlDays: number = TOMBSTONE_TTL_DAYS,
  now: number = Date.now()
): number {
  const db = getDb();
  const cutoff = cutoffIso(ttlDays, now);
  let removed = 0;

  const countRows = (sql: string, params: unknown[]): number =>
    db.getFirstSync<{ n: number }>(sql, params as any)?.n ?? 0;

  for (const table of LEAF_TABLES) {
    const where = `deleted_at IS NOT NULL AND deleted_at < ? AND synced = 1`;
    removed += countRows(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, [cutoff]);
    db.runSync(`DELETE FROM ${table} WHERE ${where}`, [cutoff]);
  }

  for (const { table, guards } of PARENT_TABLES) {
    const where = `deleted_at IS NOT NULL AND deleted_at < ? AND synced = 1 AND ${guards.join(' AND ')}`;
    removed += countRows(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, [cutoff]);
    db.runSync(`DELETE FROM ${table} WHERE ${where}`, [cutoff]);
  }

  return removed;
}
