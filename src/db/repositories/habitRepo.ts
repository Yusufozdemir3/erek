// Alışkanlık (Habit) repository.
// Önemli tasarım kararı: streak (seri) ASLA saklanmaz, her zaman loglardan hesaplanır.
// Sebebi: türetilmiş veriyi saklamak senkronda tutarsızlık yaratır. Tek doğru kaynak loglar.

import { getDb } from '../database';
import { newId, nowIso, todayDate } from '../../lib/helpers';
import type { Habit, HabitLog } from '../../types/models';

function rowToHabit(row: any): Habit {
  return {
    id: row.id,
    user_id: row.user_id,
    goal_id: row.goal_id,
    title: row.title,
    remind_at: row.remind_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
  };
}

export interface CreateHabitInput {
  user_id: string;
  title: string;
  remind_at?: string | null;
  goal_id?: string | null;
}

export const habitRepo = {
  create(input: CreateHabitInput): Habit {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO habits
       (id, user_id, goal_id, title, remind_at, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 0)`,
      [id, input.user_id, input.goal_id ?? null, input.title, input.remind_at ?? null, now]
    );
    return this.getById(id)!;
  },

  getById(id: string): Habit | null {
    const db = getDb();
    const row = db.getFirstSync<any>(
      `SELECT * FROM habits WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    return row ? rowToHabit(row) : null;
  },

  listByUser(userId: string): Habit[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM habits WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [userId]
    );
    return rows.map(rowToHabit);
  },

  update(id: string, fields: Partial<CreateHabitInput>): void {
    const db = getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.title !== undefined) { sets.push('title = ?'); vals.push(fields.title); }
    if (fields.remind_at !== undefined) { sets.push('remind_at = ?'); vals.push(fields.remind_at); }
    if (fields.goal_id !== undefined) { sets.push('goal_id = ?'); vals.push(fields.goal_id); }
    if (sets.length === 0) return;
    sets.push('updated_at = ?'); vals.push(nowIso());
    sets.push('synced = 0');
    vals.push(id);
    db.runSync(`UPDATE habits SET ${sets.join(', ')} WHERE id = ?`, vals);
  },

  softDelete(id: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(`UPDATE habits SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?`, [now, now, id]);
  },

  // Belirli bir gün için alışkanlığı tamamlandı/tamamlanmadı işaretler.
  // UNIQUE(habit_id, log_date) sayesinde aynı gün iki kayıt oluşmaz - varsa günceller.
  toggleLog(habitId: string, date: string, completed: boolean): void {
    const db = getDb();
    const now = nowIso();
    const existing = db.getFirstSync<any>(
      `SELECT id FROM habit_logs WHERE habit_id = ? AND log_date = ?`,
      [habitId, date]
    );
    if (existing) {
      db.runSync(
        `UPDATE habit_logs SET completed = ?, updated_at = ?, synced = 0 WHERE id = ?`,
        [completed ? 1 : 0, now, existing.id]
      );
    } else {
      db.runSync(
        `INSERT INTO habit_logs (id, habit_id, log_date, completed, updated_at, synced) VALUES (?, ?, ?, ?, ?, 0)`,
        [newId(), habitId, date, completed ? 1 : 0, now]
      );
    }
  },

  // Bir alışkanlığın belirli gün tamamlanıp tamamlanmadığı.
  isCompletedOn(habitId: string, date: string): boolean {
    const db = getDb();
    const row = db.getFirstSync<any>(
      `SELECT completed FROM habit_logs WHERE habit_id = ? AND log_date = ?`,
      [habitId, date]
    );
    return row?.completed === 1;
  },

  // STREAK HESABI: bugünden (ya da dünden) geriye doğru kesintisiz tamamlanan gün sayısı.
  // Bugün henüz işaretlenmemişse seriyi bozmuş sayılmaz - dünden başlar.
  currentStreak(habitId: string): number {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT log_date FROM habit_logs
       WHERE habit_id = ? AND completed = 1
       ORDER BY log_date DESC`,
      [habitId]
    );
    if (rows.length === 0) return 0;

    const completedDates = new Set(rows.map((r) => r.log_date));
    let streak = 0;
    const cursor = new Date(todayDate());

    // Bugün tamamlanmadıysa, seriyi dünden saymaya başla.
    const todayStr = todayDate();
    if (!completedDates.has(todayStr)) {
      cursor.setDate(cursor.getDate() - 1);
    }

    // Geriye doğru kesintisiz tamamlanan günleri say.
    while (true) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      if (completedDates.has(dateStr)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  },

  // Son N gündeki tamamlanma kayıtları (istatistik/takvim için).
  recentLogs(habitId: string, days: number): HabitLog[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM habit_logs
       WHERE habit_id = ?
       ORDER BY log_date DESC
       LIMIT ?`,
      [habitId, days]
    );
    return rows as HabitLog[];
  },
};
