// Subtasks — a plain checklist under a task.

import { getDb } from '../database';
import { chunk, newId, nowIso } from '../../lib/helpers';
import type { Subtask } from '../../types/models';

function rowToSubtask(row: any): Subtask {
  return {
    id: row.id,
    task_id: row.task_id,
    title: row.title,
    completed: row.completed,
    position: row.position,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
  };
}

// A subtask of a task shared WITH me is someone else's: local edits would be
// pushed and rejected. They're dropped with a warning, not thrown (an uncaught
// throw in a handler closes a release build).
function parentSharedWithMe(taskId: string): boolean {
  const row = getDb().getFirstSync<{ shared_owner_uid: string | null }>(
    `SELECT shared_owner_uid FROM tasks WHERE id = ?`,
    [taskId]
  );
  if (row?.shared_owner_uid) {
    console.warn('[subtaskRepo] Ignored a local edit to a subtask of a task shared with this user:', taskId);
    return true;
  }
  return false;
}

export const subtaskRepo = {
  // Appended last.
  create(taskId: string, title: string): Subtask {
    const db = getDb();
    // Shared with me: nothing is written; the returned object keeps callers working.
    const dropped = parentSharedWithMe(taskId);
    const id = newId();
    const now = nowIso();
    const row = db.getFirstSync<{ maxPos: number | null }>(
      `SELECT MAX(position) AS maxPos FROM subtasks WHERE task_id = ?`,
      [taskId]
    );
    const position = (row?.maxPos ?? -1) + 1;
    if (!dropped) {
      db.runSync(
        `INSERT INTO subtasks (id, task_id, title, completed, position, updated_at, deleted_at, synced)
         VALUES (?, ?, ?, 0, ?, ?, NULL, 0)`,
        [id, taskId, title, position, now]
      );
    }
    return {
      id,
      task_id: taskId,
      title,
      completed: 0,
      position,
      updated_at: now,
      deleted_at: null,
      synced: 0,
    };
  },

  // In the order they were added.
  listByTask(taskId: string): Subtask[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM subtasks WHERE task_id = ? AND deleted_at IS NULL ORDER BY position ASC`,
      [taskId]
    );
    return rows.map(rowToSubtask);
  },

  // The task card's "2/3".
  countForTask(taskId: string): { done: number; total: number } {
    const db = getDb();
    const row = db.getFirstSync<{ done: number; total: number }>(
      `SELECT COALESCE(SUM(completed), 0) AS done, COUNT(*) AS total
       FROM subtasks WHERE task_id = ? AND deleted_at IS NULL`,
      [taskId]
    );
    return { done: row?.done ?? 0, total: row?.total ?? 0 };
  },

  // countForTask for a whole list in one query; tasks without subtasks are absent.
  countsForTasks(taskIds: string[]): Record<string, { done: number; total: number }> {
    const db = getDb();
    const out: Record<string, { done: number; total: number }> = {};
    // Chunked to stay under SQLite's bound-parameter limit (helpers.chunk).
    for (const ids of chunk(taskIds)) {
      const placeholders = ids.map(() => '?').join(',');
      const rows = db.getAllSync<{ task_id: string; done: number; total: number }>(
        `SELECT task_id, COALESCE(SUM(completed), 0) AS done, COUNT(*) AS total
         FROM subtasks WHERE task_id IN (${placeholders}) AND deleted_at IS NULL
         GROUP BY task_id`,
        ids
      );
      for (const r of rows) out[r.task_id] = { done: r.done ?? 0, total: r.total ?? 0 };
    }
    return out;
  },

  setCompleted(id: string, completed: boolean): void {
    const db = getDb();
    // A subtask of a task shared with me is never touched here (its tick goes
    // through applySharedCompletion below).
    db.runSync(
      `UPDATE subtasks SET completed = ?, updated_at = ?, synced = 0
       WHERE id = ? AND task_id NOT IN (SELECT id FROM tasks WHERE shared_owner_uid IS NOT NULL)`,
      [completed ? 1 : 0, nowIso(), id]
    );
  },

  // Mirrors the server's answer for a subtask shared WITH me; synced stays 1
  // (it's the cloud row, not a local edit).
  applySharedCompletion(id: string, completed: boolean, updatedAt: string): void {
    getDb().runSync(
      `UPDATE subtasks SET completed = ?, updated_at = ?, synced = 1
       WHERE id = ? AND task_id IN (SELECT id FROM tasks WHERE shared_owner_uid IS NOT NULL)`,
      [completed ? 1 : 0, updatedAt, id]
    );
  },

  // Unticks the completed subtasks when a recurring task moves to its next
  // occurrence (unticked ones aren't touched, so no sync churn).
  reopenForTask(taskId: string): void {
    const db = getDb();
    db.runSync(
      `UPDATE subtasks SET completed = 0, updated_at = ?, synced = 0
       WHERE task_id = ? AND deleted_at IS NULL AND completed = 1`,
      [nowIso(), taskId]
    );
  },

  softDelete(id: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(
      `UPDATE subtasks SET deleted_at = ?, updated_at = ?, synced = 0
       WHERE id = ? AND task_id NOT IN (SELECT id FROM tasks WHERE shared_owner_uid IS NOT NULL)`,
      [now, now, id]
    );
  },
};
