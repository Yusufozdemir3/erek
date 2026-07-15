// Hedef (Goal) repository.
// İki tip: 'numeric' (50/100 km gibi ilerleme) ve 'milestone' (adımlara bölünebilir,
// görev/alt görev mantığıyla aynı). Her iki tipte de artık bir deadline olabilir.

import { getDb } from '../database';
import { newId, nowIso } from '../../lib/helpers';
import type { Goal, GoalType } from '../../types/models';

function rowToGoal(row: any): Goal {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    goal_type: row.goal_type as GoalType,
    target_value: row.target_value,
    current_value: row.current_value,
    unit: row.unit,
    deadline: row.deadline,
    completed_at: row.completed_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
  };
}

export interface CreateGoalInput {
  user_id: string;
  title: string;
  goal_type: GoalType;
  target_value?: number | null;
  unit?: string | null;
  deadline?: string | null;
}

export const goalRepo = {
  create(input: CreateGoalInput): Goal {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO goals
       (id, user_id, title, goal_type, target_value, current_value, unit, deadline, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, 0)`,
      [id, input.user_id, input.title, input.goal_type,
       input.target_value ?? null, input.unit ?? null, input.deadline ?? null, now]
    );
    return this.getById(id)!;
  },

  getById(id: string): Goal | null {
    const db = getDb();
    const row = db.getFirstSync<any>(
      `SELECT * FROM goals WHERE id = ? AND deleted_at IS NULL`, [id]
    );
    return row ? rowToGoal(row) : null;
  },

  listByUser(userId: string): Goal[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM goals WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [userId]
    );
    return rows.map(rowToGoal);
  },

  // Hedefin tanımını günceller (başlık, hedef değeri, birim, son tarih, mevcut değer).
  // goal_type değiştirilmez — tip değişimi alanları tutarsız bırakır.
  // current_value verilirse 0..target_value aralığına sıkıştırılır.
  update(
    id: string,
    fields: Partial<{
      title: string;
      target_value: number | null;
      unit: string | null;
      deadline: string | null;
      current_value: number;
    }>
  ): void {
    const db = getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.title !== undefined) { sets.push('title = ?'); vals.push(fields.title); }
    if (fields.target_value !== undefined) { sets.push('target_value = ?'); vals.push(fields.target_value); }
    if (fields.unit !== undefined) { sets.push('unit = ?'); vals.push(fields.unit); }
    if (fields.deadline !== undefined) { sets.push('deadline = ?'); vals.push(fields.deadline); }
    if (fields.current_value !== undefined) {
      // Hedef belirliyse aşmasın; negatif olmasın. Hedef bu çağrıda da değişebilir.
      const cap = fields.target_value !== undefined
        ? fields.target_value
        : (this.getById(id)?.target_value ?? null);
      let v = fields.current_value;
      if (v < 0) v = 0;
      if (cap != null && v > cap) v = cap;
      sets.push('current_value = ?'); vals.push(v);
    }
    if (sets.length === 0) return;
    sets.push('updated_at = ?'); vals.push(nowIso());
    sets.push('synced = 0');
    vals.push(id);
    db.runSync(`UPDATE goals SET ${sets.join(', ')} WHERE id = ?`, vals);
  },

  // Sayısal hedefte ilerlemeyi artırır (örn. +5 km). Hedefi aşmaz.
  // Yalnızca 'numeric' hedeflerde anlamlı: 'milestone' hedefte current_value
  // kullanılmadığından sessizce yok sayılır (bağlı alışkanlık geçişi de buraya
  // düşer; milestone hedefe bağlansa bile sayaç bozulmaz).
  addProgress(id: string, amount: number): void {
    const db = getDb();
    const goal = this.getById(id);
    if (!goal || goal.goal_type !== 'numeric') return;
    let next = goal.current_value + amount;
    if (goal.target_value != null && next > goal.target_value) {
      next = goal.target_value;
    }
    if (next < 0) next = 0;
    db.runSync(
      `UPDATE goals SET current_value = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [next, nowIso(), id]
    );
  },

  // 0-1 arası ilerleme oranı. UI yüzde göstergesi için.
  progressRatio(goal: Goal): number {
    if (goal.goal_type === 'numeric' && goal.target_value && goal.target_value > 0) {
      return Math.min(1, goal.current_value / goal.target_value);
    }
    return 0;
  },

  // Bir hedefin tamamlanmış sayılıp sayılmadığı — TİPE göre farklı kaynaktan:
  // 'numeric' oran/hedeften türer (ayrı bir bayrak tutulmaz); 'milestone' elle
  // ya da tüm adımlar tamamlanınca otomatik işaretlenen completed_at'ten okunur.
  isCompleted(goal: Goal): boolean {
    return goal.goal_type === 'numeric' ? this.progressRatio(goal) >= 1 : goal.completed_at != null;
  },

  // Yalnızca 'milestone' hedeflerde anlamlı (elle işaretleme ya da tüm adımlar
  // tamamlanınca otomatik çağrılır — bkz. GoalEditModal). 'numeric' hedefte
  // sessizce yok sayılır: tamamlanma zaten current_value>=target_value'dan gelir.
  setCompleted(id: string, completed: boolean): void {
    const db = getDb();
    const goal = this.getById(id);
    if (!goal || goal.goal_type !== 'milestone') return;
    db.runSync(
      `UPDATE goals SET completed_at = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [completed ? nowIso() : null, nowIso(), id]
    );
  },

  softDelete(id: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(`UPDATE goals SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?`, [now, now, id]);
  },
};
