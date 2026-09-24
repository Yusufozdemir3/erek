// Database maintenance — cleanup of expired "tombstones".
//
// PROBLEM: deletion in this app is SOFT (deleted_at is stamped, the row
// remains) and this is REQUIRED for sync — it's the only way to tell another
// device that something was deleted. But nothing ever CLEANED them up:
// rows sat in the DB forever, got re-pushed on every full re-sync, and grew
// the table that `SELECT *` queries had to scan.
//
// The fastest-growing source is reminders: reminderRepo.replaceAll soft-
// deletes the existing rows on every edit and creates new ones, so editing a
// habit's reminder time 20 times leaves 20 dead rows behind.
//
// RULE: a tombstone is only deleted once it's (a) old enough AND (b) already
// pushed to the cloud (synced = 1). Without (b), a deletion that hasn't been
// delivered yet would vanish and the record would "come back to life" from
// another device.
//
// FK SAFETY: constraints are on (PRAGMA foreign_keys = ON). Leaf tables are
// cleaned unconditionally; PARENT tables only once NO row pointing at them
// remains. That's why the order goes leaf-to-parent — a parent whose children
// got cleaned in the same pass becomes eligible right away.
//
// DELIBERATE LIMITATION: habit_logs has no deleted_at (never deleted), so a
// deleted habit that has logs won't get its row cleaned up. Deleting the logs
// too is possible, but since they have no cloud counterpart (tombstone) they'd
// just come back on the next full pull — not worth the churn. So this is left
// untouched on purpose.

import { getDb } from './database';

/** How long a tombstone must age before it can be deleted. */
export const TOMBSTONE_TTL_DAYS = 90;

// Leaf tables: no other table points at them.
const LEAF_TABLES = ['subtasks', 'goal_milestones', 'goal_entries', 'reminders'];

// Parent tables and the "does anything still point at me" guard conditions.
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

/**
 * Permanently deletes expired, already-cloud-pushed tombstones.
 * Returns the total number of rows removed. `now` is parameterized for tests.
 */
export function purgeOldTombstones(
  ttlDays: number = TOMBSTONE_TTL_DAYS,
  now: number = Date.now()
): number {
  const db = getDb();
  const cutoff = cutoffIso(ttlDays, now);
  let removed = 0;

  const countRows = (sql: string, params: unknown[]): number =>
    db.getFirstSync<{ n: number }>(sql, params as any)?.n ?? 0;

  // Leaves first, then parents (so they become eligible within the same pass).
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
