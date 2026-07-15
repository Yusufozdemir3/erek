// Hedef adımı (GoalMilestone) repository — basit checklist, subtaskRepo ile
// birebir aynı desen. UI asla SQL görmez - sadece bu fonksiyonları çağırır.
// Her yazma işlemi updated_at'i tazeler ve synced=0 yapar (senkron bekliyor).

import { getDb } from '../database';
import { newId, nowIso } from '../../lib/helpers';
import type { GoalMilestone } from '../../types/models';

function rowToMilestone(row: any): GoalMilestone {
  return {
    id: row.id,
    goal_id: row.goal_id,
    title: row.title,
    completed: row.completed,
    position: row.position,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
  };
}

export const goalMilestoneRepo = {
  // Yeni adım; listenin sonuna eklenir (position = mevcut en büyük + 1).
  create(goalId: string, title: string): GoalMilestone {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    const row = db.getFirstSync<{ maxPos: number | null }>(
      `SELECT MAX(position) AS maxPos FROM goal_milestones WHERE goal_id = ?`,
      [goalId]
    );
    const position = (row?.maxPos ?? -1) + 1;
    db.runSync(
      `INSERT INTO goal_milestones (id, goal_id, title, completed, position, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, 0, ?, ?, NULL, 0)`,
      [id, goalId, title, position, now]
    );
    return {
      id,
      goal_id: goalId,
      title,
      completed: 0,
      position,
      updated_at: now,
      deleted_at: null,
      synced: 0,
    };
  },

  // Bir hedefin aktif adımları, eklenme sırasıyla.
  listByGoal(goalId: string): GoalMilestone[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM goal_milestones WHERE goal_id = ? AND deleted_at IS NULL ORDER BY position ASC`,
      [goalId]
    );
    return rows.map(rowToMilestone);
  },

  // Hedef kartlarındaki "2/3" rozeti için: tamamlanan / toplam.
  countForGoal(goalId: string): { done: number; total: number } {
    const db = getDb();
    const row = db.getFirstSync<{ done: number; total: number }>(
      `SELECT COALESCE(SUM(completed), 0) AS done, COUNT(*) AS total
       FROM goal_milestones WHERE goal_id = ? AND deleted_at IS NULL`,
      [goalId]
    );
    return { done: row?.done ?? 0, total: row?.total ?? 0 };
  },

  // countForGoal'ün ÇOKLU sürümü: liste ekranı her hedef için ayrı sorgu (N+1)
  // yerine tek GROUP BY ile tüm rozet sayılarını alır. Yalnızca en az bir
  // (silinmemiş) adımı olan hedefler döner.
  countsForGoals(goalIds: string[]): Record<string, { done: number; total: number }> {
    if (goalIds.length === 0) return {};
    const db = getDb();
    const placeholders = goalIds.map(() => '?').join(',');
    const rows = db.getAllSync<{ goal_id: string; done: number; total: number }>(
      `SELECT goal_id, COALESCE(SUM(completed), 0) AS done, COUNT(*) AS total
       FROM goal_milestones WHERE goal_id IN (${placeholders}) AND deleted_at IS NULL
       GROUP BY goal_id`,
      goalIds
    );
    const out: Record<string, { done: number; total: number }> = {};
    for (const r of rows) out[r.goal_id] = { done: r.done ?? 0, total: r.total ?? 0 };
    return out;
  },

  setCompleted(id: string, completed: boolean): void {
    const db = getDb();
    db.runSync(
      `UPDATE goal_milestones SET completed = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [completed ? 1 : 0, nowIso(), id]
    );
  },

  softDelete(id: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(
      `UPDATE goal_milestones SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [now, now, id]
    );
  },
};
