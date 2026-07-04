// Alışkanlık (Habit) repository.
// Önemli tasarım kararı: streak (seri) ASLA saklanmaz, her zaman loglardan hesaplanır.
// Sebebi: türetilmiş veriyi saklamak senkronda tutarsızlık yaratır. Tek doğru kaynak loglar.

import { getDb } from '../database';
import { isScheduledOn, isWithinHabitDates, newId, nowIso, parseJson, todayDate, toJson } from '../../lib/helpers';
import type { Habit, HabitLog, Recurrence } from '../../types/models';
import { goalRepo } from './goalRepo';

function rowToHabit(row: any): Habit {
  return {
    id: row.id,
    user_id: row.user_id,
    goal_id: row.goal_id,
    title: row.title,
    remind_at: row.remind_at,
    icon: row.icon,
    color: row.color,
    schedule: parseJson<Recurrence>(row.schedule),
    target_amount: row.target_amount,
    unit: row.unit,
    start_date: row.start_date,
    end_date: row.end_date,
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
  icon?: string | null;
  color?: string | null;
  schedule?: Recurrence | null;
  target_amount?: number | null;
  unit?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

export const habitRepo = {
  create(input: CreateHabitInput): Habit {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO habits
       (id, user_id, goal_id, title, remind_at, icon, color, schedule, target_amount, unit, start_date, end_date, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)`,
      [
        id,
        input.user_id,
        input.goal_id ?? null,
        input.title,
        input.remind_at ?? null,
        input.icon ?? null,
        input.color ?? null,
        toJson(input.schedule ?? null),
        input.target_amount ?? null,
        input.unit ?? null,
        input.start_date ?? null,
        input.end_date ?? null,
        now,
      ]
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
    if (fields.icon !== undefined) { sets.push('icon = ?'); vals.push(fields.icon); }
    if (fields.color !== undefined) { sets.push('color = ?'); vals.push(fields.color); }
    if (fields.schedule !== undefined) { sets.push('schedule = ?'); vals.push(toJson(fields.schedule)); }
    if (fields.target_amount !== undefined) { sets.push('target_amount = ?'); vals.push(fields.target_amount); }
    if (fields.unit !== undefined) { sets.push('unit = ?'); vals.push(fields.unit); }
    if (fields.start_date !== undefined) { sets.push('start_date = ?'); vals.push(fields.start_date); }
    if (fields.end_date !== undefined) { sets.push('end_date = ?'); vals.push(fields.end_date); }
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
      `SELECT id, completed FROM habit_logs WHERE habit_id = ? AND log_date = ?`,
      [habitId, date]
    );
    const wasCompleted = existing?.completed === 1;
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
    this.bumpGoalIfLinked(habitId, wasCompleted, completed);
  },

  // Alışkanlık bir hedefe bağlıysa, TAMAMLANMA GEÇİŞİNDE bağlı hedefin
  // ilerlemesini günceller: tamamlandı → +1, geri alındı → −1. Yalnızca durum
  // gerçekten değiştiğinde çalışır; aynı durumu tekrar yazmak (ör. zaten
  // tamamlanmış günü tekrar işaretlemek) hedefi etkilemez → çift sayım olmaz.
  // Bir günü geçmişe dönük işaretlemek de geçerli bir geçiştir. goalRepo.addProgress
  // 0..target aralığına sıkıştırır ve numeric olmayan hedefi zaten yok sayar.
  // NOT: Çok-cihaz senkronunda goal.current_value LWW ile taşınır; bu, manuel
  // +1/+5 ilerlemesindeki mevcut sınırla aynıdır (eşzamanlı katkılar birleşmez).
  bumpGoalIfLinked(habitId: string, wasCompleted: boolean, isCompleted: boolean): void {
    if (wasCompleted === isCompleted) return;
    const habit = this.getById(habitId);
    if (!habit?.goal_id) return;
    goalRepo.addProgress(habit.goal_id, isCompleted ? 1 : -1);
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

  // Nicel alışkanlık: belirli gün yapılan miktar (kayıt yoksa 0).
  getAmountOn(habitId: string, date: string): number {
    const db = getDb();
    const row = db.getFirstSync<any>(
      `SELECT amount FROM habit_logs WHERE habit_id = ? AND log_date = ?`,
      [habitId, date]
    );
    return row?.amount ?? 0;
  },

  // Nicel alışkanlık: o günün miktarını delta kadar değiştirir (0'ın altına inmez).
  // completed, hedefe ulaşıldığında (amount >= target) 1 olur. target null/0 ise
  // completed hep 0 kalır. UNIQUE(habit_id, log_date) ile tek kayıt tutulur.
  incrementAmount(habitId: string, date: string, delta: number, target: number | null): void {
    const db = getDb();
    const now = nowIso();
    const existing = db.getFirstSync<any>(
      `SELECT id, amount, completed FROM habit_logs WHERE habit_id = ? AND log_date = ?`,
      [habitId, date]
    );
    const wasCompleted = existing?.completed === 1;
    const current = existing ? existing.amount ?? 0 : 0;
    const next = Math.max(0, current + delta);
    const completed = target != null && target > 0 && next >= target ? 1 : 0;
    if (existing) {
      db.runSync(
        `UPDATE habit_logs SET amount = ?, completed = ?, updated_at = ?, synced = 0 WHERE id = ?`,
        [next, completed, now, existing.id]
      );
    } else {
      db.runSync(
        `INSERT INTO habit_logs (id, habit_id, log_date, completed, amount, updated_at, synced)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [newId(), habitId, date, completed, next, now]
      );
    }
    // Nicel alışkanlıkta da hedefe katkı "tamamlanan gün" başına +1'dir (o gün
    // yapılan miktar kadar DEĞİL): hedefe ulaşınca (0→1) +1, altına düşünce (1→0) −1.
    this.bumpGoalIfLinked(habitId, wasCompleted, completed === 1);
  },

  // STREAK HESABI: bugünden geriye doğru, alışkanlığın PLANLI günlerini sayar.
  // Yalnızca schedule'a göre vadeli VE yaşam aralığı (start/end) içindeki günler
  // dikkate alınır — plansız/aralık dışı günlerdeki boşluk seriyi bozmaz
  // (ör. Pzt/Çar/Cum alışkanlığında Salı önemsiz; bitişten sonraki günler de).
  // Bugün planlıysa ve henüz işaretlenmemişse seriyi bozmaz (bir önceki planlı
  // günden devam eder). İlk kaçırılan planlı günde durur.
  currentStreak(habitId: string): number {
    const db = getDb();
    const habit = this.getById(habitId);
    const isDue = (d: string) =>
      isScheduledOn(habit?.schedule ?? null, d) &&
      isWithinHabitDates(habit?.start_date ?? null, habit?.end_date ?? null, d);
    const rows = db.getAllSync<any>(
      `SELECT log_date FROM habit_logs
       WHERE habit_id = ? AND completed = 1
       ORDER BY log_date DESC`,
      [habitId]
    );
    if (rows.length === 0) return 0;

    const completed = new Set<string>(rows.map((r) => r.log_date));
    const today = todayDate();
    let streak = 0;
    const cursor = new Date(`${today}T00:00:00`);

    // Geriye doğru gün gün yürü; yalnızca planlı günleri değerlendir.
    // Üst sınır ~2+ yılı kapsar (haftalık planda seyrek günler için geniş).
    for (let i = 0; i < 800; i++) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      if (isDue(dateStr)) {
        if (completed.has(dateStr)) {
          streak++;
        } else if (dateStr === today) {
          // Bugün henüz işaretlenmedi — seriyi bozma, atla.
        } else {
          break;
        }
      }
      cursor.setDate(cursor.getDate() - 1);
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

  // Belirli bir tarihten (dahil) bugüne kadar TÜM loglar (istatistik ekranı için:
  // ısı haritası, tamamlanma oranı, toplam miktar hepsi bu tek sorgudan türetilir).
  // recentLogs'tan farkı: satır sayısına değil tarih aralığına göre filtreler —
  // boş günler (hiç log yoksa) çağıran tarafta günlerin tam listesiyle tamamlanmalı.
  logsInRange(habitId: string, sinceYmd: string): HabitLog[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM habit_logs WHERE habit_id = ? AND log_date >= ? ORDER BY log_date ASC`,
      [habitId, sinceYmd]
    );
    return rows as HabitLog[];
  },

  // EN UZUN SERİ: currentStreak'in "bugünden geriye" mantığının aksine, ilk
  // tamamlanan günden bugüne kadar tüm geçmişi baştan sona tarayıp gördüğü en
  // uzun ardışık planlı-gün serisini döner. Aynı planlı-gün kuralını kullanır
  // (plansız/aralık dışı gün boşluğu seriyi bozmaz).
  longestStreak(habitId: string): number {
    const db = getDb();
    const habit = this.getById(habitId);
    const isDue = (d: string) =>
      isScheduledOn(habit?.schedule ?? null, d) &&
      isWithinHabitDates(habit?.start_date ?? null, habit?.end_date ?? null, d);
    const rows = db.getAllSync<any>(
      `SELECT log_date FROM habit_logs
       WHERE habit_id = ? AND completed = 1
       ORDER BY log_date ASC`,
      [habitId]
    );
    if (rows.length === 0) return 0;

    const completed = new Set<string>(rows.map((r) => r.log_date));
    const today = todayDate();
    let run = 0;
    let best = 0;
    const cursor = new Date(`${rows[0].log_date}T00:00:00`);
    const end = new Date(`${today}T00:00:00`);

    while (cursor <= end) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      if (isDue(dateStr)) {
        if (completed.has(dateStr)) {
          run++;
          if (run > best) best = run;
        } else {
          run = 0;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return best;
  },
};
