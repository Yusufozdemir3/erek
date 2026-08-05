// Veritabanı bakımı — süresi dolmuş "mezar taşlarının" (tombstone) temizliği.
//
// SORUN: silme bu uygulamada SOFT'tur (deleted_at damgalanır, satır kalır) ve
// bu senkron için ŞART — silindiğini diğer cihaza ancak bir satır anlatabilir.
// Ama hiçbir şey onları hiç TEMİZLEMİYORDU: satırlar sonsuza dek DB'de duruyor,
// her tam yeniden senkronda yeniden push ediliyor ve `SELECT *` yapan sorguların
// taradığı tabloyu büyütüyorlardı.
//
// En hızlı büyüyen kaynak hatırlatmalar: reminderRepo.replaceAll her kayıtta
// mevcut satırları soft-delete edip yenilerini üretir, yani bir alışkanlığın
// hatırlatma saatini 20 kez düzenlemek 20 ölü satır bırakır.
//
// KURAL: bir tombstone ancak (a) yeterince eskiyse VE (b) buluta gönderildiyse
// (synced = 1) silinir. (b) olmadan, henüz iletilmemiş bir silme kaybolur ve
// kayıt diğer cihazdan geri "dirilir".
//
// FK GÜVENLİĞİ: kısıtlar açık (PRAGMA foreign_keys = ON). Yaprak tablolar
// koşulsuz temizlenir; EBEVEYN tablolar yalnızca onlara işaret eden HİÇBİR satır
// kalmadıysa. Bu yüzden sıra da yapraktan ebeveyne doğrudur — aynı turda
// çocukları temizlenen bir ebeveyn hemen uygun hale gelir.
//
// BİLİNÇLİ SINIR: habit_logs'un deleted_at'i yok (hiç silinmez), dolayısıyla
// logu olan silinmiş bir alışkanlığın satırı temizlenmez. Logları da silmek
// mümkün ama bulutta karşılığı (tombstone) olmadığı için bir sonraki tam
// çekişte geri gelir — churn'e değmez. Bu yüzden bilerek dokunulmuyor.

import { getDb } from './database';

/** Bir tombstone'un silinebilmesi için geçmesi gereken süre. */
export const TOMBSTONE_TTL_DAYS = 90;

// Yaprak tablolar: kendilerine işaret eden başka tablo yok.
const LEAF_TABLES = ['subtasks', 'goal_milestones', 'goal_entries', 'reminders'];

// Ebeveyn tablolar ve "bana işaret eden satır var mı" koşulları.
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
 * Süresi dolmuş, buluta gönderilmiş tombstone'ları kalıcı olarak siler.
 * Silinen toplam satır sayısını döner. `now` testler için parametreli.
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

  // Önce yapraklar, sonra ebeveynler (aynı turda uygun hale gelsinler).
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
