// Hedef adımı (GoalMilestone) repository — subtaskRepo ile aynı temel desen.
// İki adım kipi var (bkz. models.GoalMilestone): checklist (milestone hedef)
// ve ara-eşik (numeric hedef + amount). UI asla SQL görmez.
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
    amount: row.amount,
    due_date: row.due_date,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
  };
}

// Ara-eşik kipindeki adımın görünüm durumu (bkz. milestoneViews).
export interface MilestoneView {
  milestone: GoalMilestone;
  ratio: number;    // 0..1 — adımın kendi doluluk oranı
  reached: boolean; // kümülatif eşik aşıldı mı (checklist kipinde completed)
}

// SAYISAL hedefin adım görünümleri: miktarı olan adımlar position sırasıyla
// KÜMÜLATİF eşikler oluşturur ve hedefin current_value'sundan sırayla dolar —
// elle işaretlenmez, yalnız girişlere bağlı değişir. Miktarı olmayan (eski/
// checklist) adımlar kendi completed durumunu korur. Saf fonksiyon (SQL yok) —
// hem UI hem test doğrudan çağırır.
export function milestoneViews(milestones: GoalMilestone[], currentValue: number): MilestoneView[] {
  let cumulative = 0;
  return milestones.map((m) => {
    if (m.amount == null || m.amount <= 0) {
      return { milestone: m, ratio: m.completed === 1 ? 1 : 0, reached: m.completed === 1 };
    }
    const start = cumulative;
    cumulative += m.amount;
    const ratio = Math.max(0, Math.min(1, (currentValue - start) / m.amount));
    return { milestone: m, ratio, reached: currentValue >= cumulative };
  });
}

export const goalMilestoneRepo = {
  // Yeni adım; listenin sonuna eklenir (position = mevcut en büyük + 1).
  // extra: numeric hedefte ara-eşik miktarı ve/veya opsiyonel son tarih.
  create(
    goalId: string,
    title: string,
    extra: { amount?: number | null; due_date?: string | null } = {}
  ): GoalMilestone {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    const row = db.getFirstSync<{ maxPos: number | null }>(
      `SELECT MAX(position) AS maxPos FROM goal_milestones WHERE goal_id = ?`,
      [goalId]
    );
    const position = (row?.maxPos ?? -1) + 1;
    const amount = extra.amount ?? null;
    const due_date = extra.due_date ?? null;
    db.runSync(
      `INSERT INTO goal_milestones (id, goal_id, title, completed, position, amount, due_date, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, NULL, 0)`,
      [id, goalId, title, position, amount, due_date, now]
    );
    return {
      id,
      goal_id: goalId,
      title,
      completed: 0,
      position,
      amount,
      due_date,
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
