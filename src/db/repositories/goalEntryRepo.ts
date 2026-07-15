// Hedef girdi geçmişi (GoalEntry) repository — goalMilestoneRepo ile aynı desen.
// UI asla SQL görmez - sadece bu fonksiyonları çağırır.
// ÖNEMLİ: bu tablo yalnızca bir GÜNLÜKTÜR. goal.current_value tek doğru kaynak
// olmaya devam eder (goalRepo.addProgress ile güncellenir); buradaki kayıtlar
// yalnızca "ne zaman ne kadar eklendi" geçmişini kullanıcıya göstermek içindir.

import { getDb } from '../database';
import { newId, nowIso } from '../../lib/helpers';
import type { GoalEntry } from '../../types/models';

function rowToEntry(row: any): GoalEntry {
  return {
    id: row.id,
    goal_id: row.goal_id,
    amount: row.amount,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
  };
}

export const goalEntryRepo = {
  // Yeni girdi kaydı (yalnız günlük — current_value'yu değiştirmez, çağıran
  // ayrıca goalRepo.addProgress çağırmalı).
  create(goalId: string, amount: number): GoalEntry {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO goal_entries (id, goal_id, amount, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, NULL, 0)`,
      [id, goalId, amount, now]
    );
    return { id, goal_id: goalId, amount, updated_at: now, deleted_at: null, synced: 0 };
  },

  // Bir hedefin girdi geçmişi, en yeniden en eskiye.
  listByGoal(goalId: string): GoalEntry[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM goal_entries WHERE goal_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [goalId]
    );
    return rows.map(rowToEntry);
  },
};
