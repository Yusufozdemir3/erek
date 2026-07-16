// Alışkanlık (Habit) repository.
// Önemli tasarım kararı: streak (seri) ASLA saklanmaz, her zaman loglardan hesaplanır.
// Sebebi: türetilmiş veriyi saklamak senkronda tutarsızlık yaratır. Tek doğru kaynak loglar.

import { getDb } from '../database';
import {
  isQuotaSchedule,
  isScheduledOn,
  isWithinHabitDates,
  newId,
  nowIso,
  parseJson,
  todayDate,
  toJson,
  toYmd,
  weekStartOf,
} from '../../lib/helpers';

// — KOTA ("haftada X kez") seri yardımcıları —
// Kota kuralında hiçbir gün tek başına vadeli olmadığından seriler GÜN değil
// HAFTA bazında sayılır: bir hafta, içindeki tamamlanan gün sayısı kotaya
// ulaştıysa "yapıldı"dır. Haftalar Pazartesi başlangıçlıdır (weekStartOf).

// Tamamlanan log tarihlerini hafta-başlangıcı anahtarına göre sayar.
function weekCompletionCounts(dates: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const ws = weekStartOf(d);
    counts.set(ws, (counts.get(ws) ?? 0) + 1);
  }
  return counts;
}

function shiftWeek(weekStart: string, weeks: number): string {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return toYmd(d);
}
import type { GoalContribution, Habit, HabitKind, HabitLog, Recurrence } from '../../types/models';
import { goalRepo } from './goalRepo';

function rowToHabit(row: any): Habit {
  return {
    id: row.id,
    user_id: row.user_id,
    goal_id: row.goal_id,
    title: row.title,
    kind: (row.kind ?? 'binary') as HabitKind,
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
    goal_contribution: row.goal_contribution ?? null,
    goal_factor: row.goal_factor ?? 1,
  };
}

export interface CreateHabitInput {
  user_id: string;
  title: string;
  kind?: HabitKind; // varsayılan 'binary'
  remind_at?: string | null;
  goal_id?: string | null;
  icon?: string | null;
  color?: string | null;
  schedule?: Recurrence | null;
  target_amount?: number | null;
  unit?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  goal_contribution?: GoalContribution | null; // NULL = per_completion (varsayılan)
  goal_factor?: number;                        // yalnız 'amount' modunda anlamlı; varsayılan 1
}

export const habitRepo = {
  create(input: CreateHabitInput): Habit {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO habits
       (id, user_id, goal_id, title, kind, remind_at, icon, color, schedule, target_amount, unit, start_date, end_date, goal_contribution, goal_factor, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)`,
      [
        id,
        input.user_id,
        input.goal_id ?? null,
        input.title,
        input.kind ?? 'binary',
        input.remind_at ?? null,
        input.icon ?? null,
        input.color ?? null,
        toJson(input.schedule ?? null),
        input.target_amount ?? null,
        input.unit ?? null,
        input.start_date ?? null,
        input.end_date ?? null,
        input.goal_contribution ?? null,
        input.goal_factor ?? 1,
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
    if (fields.kind !== undefined) { sets.push('kind = ?'); vals.push(fields.kind); }
    if (fields.remind_at !== undefined) { sets.push('remind_at = ?'); vals.push(fields.remind_at); }
    if (fields.goal_id !== undefined) { sets.push('goal_id = ?'); vals.push(fields.goal_id); }
    if (fields.icon !== undefined) { sets.push('icon = ?'); vals.push(fields.icon); }
    if (fields.color !== undefined) { sets.push('color = ?'); vals.push(fields.color); }
    if (fields.schedule !== undefined) { sets.push('schedule = ?'); vals.push(toJson(fields.schedule)); }
    if (fields.target_amount !== undefined) { sets.push('target_amount = ?'); vals.push(fields.target_amount); }
    if (fields.unit !== undefined) { sets.push('unit = ?'); vals.push(fields.unit); }
    if (fields.start_date !== undefined) { sets.push('start_date = ?'); vals.push(fields.start_date); }
    if (fields.end_date !== undefined) { sets.push('end_date = ?'); vals.push(fields.end_date); }
    if (fields.goal_contribution !== undefined) { sets.push('goal_contribution = ?'); vals.push(fields.goal_contribution); }
    if (fields.goal_factor !== undefined) { sets.push('goal_factor = ?'); vals.push(fields.goal_factor); }
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

  // Alışkanlık bir hedefe "per_completion" modunda (varsayılan) bağlıysa,
  // TAMAMLANMA GEÇİŞİNDE bağlı hedefin ilerlemesini günceller: tamamlandı → +1,
  // geri alındı → −1. Yalnızca durum gerçekten değiştiğinde çalışır; aynı durumu
  // tekrar yazmak (ör. zaten tamamlanmış günü tekrar işaretlemek) hedefi
  // etkilemez → çift sayım olmaz. Bir günü geçmişe dönük işaretlemek de geçerli
  // bir geçiştir. goalRepo.addProgress 0..target aralığına sıkıştırır ve numeric
  // olmayan hedefi zaten yok sayar.
  // 'amount' modundaki alışkanlıklar bu fonksiyona hiç girmez (bkz. incrementAmount) —
  // onlarda katkı tamamlanma durumuna değil, o anki miktar farkına bağlıdır.
  // NOT: Çok-cihaz senkronunda goal.current_value LWW ile taşınır; bu, manuel
  // +1/+5 ilerlemesindeki mevcut sınırla aynıdır (eşzamanlı katkılar birleşmez).
  // `habit` verilirse (incrementAmount zaten çekmişse) tekrar sorgu atılmaz.
  bumpGoalIfLinked(
    habitId: string,
    wasCompleted: boolean,
    isCompleted: boolean,
    habit?: Habit | null
  ): void {
    if (wasCompleted === isCompleted) return;
    const h = habit !== undefined ? habit : this.getById(habitId);
    if (!h?.goal_id) return;
    goalRepo.addProgress(h.goal_id, isCompleted ? 1 : -1);
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

  // getAmountOn + isCompletedOn'un ÇOKLU sürümü: "Bugün" ekranı, her alışkanlık
  // için o günün miktar+tamamlanma bilgisini iki ayrı sorguyla (N+1) çekmek
  // yerine tek soruda alır. habit_logs'ta UNIQUE(habit_id, log_date) olduğundan
  // alışkanlık başına en çok bir satır döner; log'u olmayan alışkanlık sonuçta
  // hiç yer almaz (çağıran amount=0 / completed=false varsayar).
  getDayStates(
    habitIds: string[],
    date: string
  ): Record<string, { amount: number; completed: boolean }> {
    if (habitIds.length === 0) return {};
    const db = getDb();
    const placeholders = habitIds.map(() => '?').join(',');
    const rows = db.getAllSync<{ habit_id: string; amount: number; completed: number }>(
      `SELECT habit_id, amount, completed FROM habit_logs
       WHERE log_date = ? AND habit_id IN (${placeholders})`,
      [date, ...habitIds]
    );
    const out: Record<string, { amount: number; completed: boolean }> = {};
    for (const r of rows) out[r.habit_id] = { amount: r.amount ?? 0, completed: r.completed === 1 };
    return out;
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
    // 0 tabanına çarpınca istenen delta ile gerçekte uygulanan fark ayrışabilir
    // (ör. current=2, delta=-5 istenirse next=0, gerçek fark -2'dir) — 'amount'
    // modunda hedefe bunun (istenenin değil) gerçek farkı yansır.
    const appliedDelta = next - current;
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
    // Hedefe katkı iki moddan biri: 'amount' ise HER değişiklikte (tamamlanma
    // beklemeden) gerçek fark × çarpan hedefe yansır; yoksa (varsayılan
    // per_completion) yalnızca tamamlanma DURUM geçişinde +1/-1 uygulanır.
    const habit = this.getById(habitId);
    if (habit?.goal_id && habit.goal_contribution === 'amount') {
      if (appliedDelta !== 0) goalRepo.addProgress(habit.goal_id, appliedDelta * habit.goal_factor);
    } else {
      this.bumpGoalIfLinked(habitId, wasCompleted, completed === 1, habit);
    }
  },

  // STREAK HESABI: bugünden geriye doğru, alışkanlığın PLANLI günlerini sayar.
  // Yalnızca schedule'a göre vadeli VE yaşam aralığı (start/end) içindeki günler
  // dikkate alınır — plansız/aralık dışı günlerdeki boşluk seriyi bozmaz
  // (ör. Pzt/Çar/Cum alışkanlığında Salı önemsiz; bitişten sonraki günler de).
  // Bugün planlıysa ve henüz işaretlenmemişse seriyi bozmaz (bir önceki planlı
  // günden devam eder). İlk kaçırılan planlı günde durur.
  // KOTA (haftada X kez) kuralında sonuç GÜN değil HAFTA sayısıdır: kotası dolan
  // ardışık haftalar; içinde bulunulan hafta dolmadıysa seriyi bozmaz (hafta
  // bitmedi), dolduysa sayılır.
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

    if (isQuotaSchedule(habit?.schedule ?? null)) {
      const quota = habit!.schedule!.timesPerWeek!;
      const counts = weekCompletionCounts(rows.map((r) => r.log_date));
      let cursor = weekStartOf(todayDate());
      let streak = 0;
      if ((counts.get(cursor) ?? 0) >= quota) streak++;
      // Bu hafta henüz dolmadıysa bozmaz — önceki haftalardan devam.
      cursor = shiftWeek(cursor, -1);
      while ((counts.get(cursor) ?? 0) >= quota) {
        streak++;
        cursor = shiftWeek(cursor, -1);
      }
      return streak;
    }

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

  // Bir alışkanlığın TÜM geçmiş logları (tarihe göre artan). İstatistik
  // ekranının skor/seri/haftanın-günü hesapları tek bu sorgudan türetilir.
  allLogs(habitId: string): HabitLog[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM habit_logs WHERE habit_id = ? ORDER BY log_date ASC`,
      [habitId]
    );
    return rows as HabitLog[];
  },

  // KOTA (haftada X kez) alışkanlığında verilen günün haftasında tamamlanan gün
  // sayısı — "Bugün" ekranındaki "2/3 bu hafta" göstergesi için.
  completionsInWeek(habitId: string, dateYmd: string): number {
    const db = getDb();
    const start = weekStartOf(dateYmd);
    const endD = new Date(`${start}T00:00:00`);
    endD.setDate(endD.getDate() + 6);
    const rows = db.getAllSync<any>(
      `SELECT COUNT(*) AS n FROM habit_logs
       WHERE habit_id = ? AND completed = 1 AND log_date >= ? AND log_date <= ?`,
      [habitId, start, toYmd(endD)]
    );
    return rows[0]?.n ?? 0;
  },

  // İki tarih arasındaki (dahil) loglar — takvim ay görünümü için. logsInRange'den
  // farkı: açık uçlu "bugüne kadar" değil, KAPALI bir aralık (geçmiş ayları gezerken).
  logsBetween(habitId: string, startYmd: string, endYmd: string): HabitLog[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM habit_logs WHERE habit_id = ? AND log_date >= ? AND log_date <= ? ORDER BY log_date ASC`,
      [habitId, startYmd, endYmd]
    );
    return rows as HabitLog[];
  },

  // EN UZUN SERİ: currentStreak'in "bugünden geriye" mantığının aksine, ilk
  // tamamlanan günden bugüne kadar tüm geçmişi baştan sona tarayıp gördüğü en
  // uzun ardışık planlı-gün serisini döner. Aynı planlı-gün kuralını kullanır
  // (plansız/aralık dışı gün boşluğu seriyi bozmaz).
  // KOTA kuralında sonuç HAFTA sayısıdır; içinde bulunulan (bitmemiş) hafta
  // dolmadıysa seri BOZULMAZ ama sayılmaz da (currentStreak ile tutarlı).
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

    if (isQuotaSchedule(habit?.schedule ?? null)) {
      const quota = habit!.schedule!.timesPerWeek!;
      const counts = weekCompletionCounts(rows.map((r) => r.log_date));
      const currentWeek = weekStartOf(todayDate());
      let cursor = weekStartOf(rows[0].log_date);
      let run = 0;
      let best = 0;
      while (cursor <= currentWeek) {
        if ((counts.get(cursor) ?? 0) >= quota) {
          run++;
          if (run > best) best = run;
        } else if (cursor !== currentWeek) {
          run = 0;
        }
        cursor = shiftWeek(cursor, 1);
      }
      return best;
    }

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

  // TÜM SERİLER: longestStreak'le AYNI yürüyüş ve AYNI planlı-gün kuralı, ama
  // tek bir "en iyi" yerine geçmişteki HER ardışık seriyi (uzunluk + başlangıç/
  // bitiş tarihi) toplar — istatistik ekranındaki "seri geçmişi" listesi için.
  // Bilinçli tutarlılık: longestStreak'in bugünü-tolerans göstermeyen kuralıyla
  // birebir aynı sonucu üretir (ayrı bir "current" özel durumu YOK).
  // KOTA kuralında girdiler hafta bazındadır (length = hafta sayısı, start/end =
  // serinin ilk haftasının pazartesisi / son haftasının pazarı).
  allStreaks(habitId: string): { length: number; start: string; end: string }[] {
    const db = getDb();
    const habit = this.getById(habitId);
    const isDue = (d: string) =>
      isScheduledOn(habit?.schedule ?? null, d) &&
      isWithinHabitDates(habit?.start_date ?? null, habit?.end_date ?? null, d);
    const rows = db.getAllSync<any>(
      `SELECT log_date FROM habit_logs WHERE habit_id = ? AND completed = 1 ORDER BY log_date ASC`,
      [habitId]
    );
    if (rows.length === 0) return [];

    if (isQuotaSchedule(habit?.schedule ?? null)) {
      const quota = habit!.schedule!.timesPerWeek!;
      const counts = weekCompletionCounts(rows.map((r) => r.log_date));
      const currentWeek = weekStartOf(todayDate());
      const streaks: { length: number; start: string; end: string }[] = [];
      let cursor = weekStartOf(rows[0].log_date);
      let run = 0;
      let runStart: string | null = null;
      let runEnd: string | null = null;
      const flush = () => {
        if (run > 0 && runStart && runEnd) {
          const d = new Date(`${runEnd}T00:00:00`);
          d.setDate(d.getDate() + 6); // haftanın pazarı
          streaks.push({ length: run, start: runStart, end: toYmd(d) });
        }
        run = 0;
        runStart = null;
        runEnd = null;
      };
      while (cursor <= currentWeek) {
        if ((counts.get(cursor) ?? 0) >= quota) {
          if (run === 0) runStart = cursor;
          run++;
          runEnd = cursor;
        } else if (cursor !== currentWeek) {
          flush(); // bitmemiş mevcut hafta seriyi bozmaz (longestStreak ile tutarlı)
        }
        cursor = shiftWeek(cursor, 1);
      }
      flush();
      return streaks.sort((a, b) => b.length - a.length);
    }

    const completed = new Set<string>(rows.map((r) => r.log_date));
    const today = todayDate();
    const cursor = new Date(`${rows[0].log_date}T00:00:00`);
    const end = new Date(`${today}T00:00:00`);

    const streaks: { length: number; start: string; end: string }[] = [];
    let run = 0;
    let runStart: string | null = null;
    let runEnd: string | null = null;
    const flush = () => {
      if (run > 0 && runStart && runEnd) streaks.push({ length: run, start: runStart, end: runEnd });
      run = 0;
      runStart = null;
      runEnd = null;
    };

    while (cursor <= end) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      if (isDue(dateStr)) {
        if (completed.has(dateStr)) {
          if (run === 0) runStart = dateStr;
          run++;
          runEnd = dateStr;
        } else {
          flush();
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    flush(); // döngü biterken açık kalan seriyi de ekle

    return streaks.sort((a, b) => b.length - a.length);
  },
};
