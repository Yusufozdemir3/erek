// YEREL KİMLİK YENİLEME — "birleştir" (fork) akışının kalbi.
//
// SORUN (sahada görüldü, 2026-07-23): id'ler cihazda üretilir ve hesap değişince
// DEĞİŞMEZ. Aynı cihazın verisi önce A hesabına (ya da anonim bir oturuma)
// gönderilmişse, sonra B hesabıyla push denendiğinde Postgres şu hatayı verir:
//   "new row violates row-level security policy (USING expression)"
// Çünkü upsert(onConflict: id) var olan satırı GÜNCELLEMEYE çalışır; o satır
// başka bir uid'e aittir ve RLS'in USING koşulu B'ye onu göstermez. Senkron o
// tabloda kalıcı olarak kilitlenir — arkasındaki tablolar hiç sıraya gelmez.
//
// ÇÖZÜM: yerel satırlara YENİ id verilir. Böylece push, güncelleme değil EKLEME
// olur; eski hesabın buluttaki satırlarına hiç dokunulmaz, çakışma matematiksel
// olarak imkânsız hale gelir. Yerel veri aynen korunur (yalnız kimlikleri değişir).
//
// FK SIRASI: şemada ON UPDATE CASCADE YOK (bkz. migration001), o yüzden ebeveyn
// id'sini değiştirmek çocukları kırardı. Bu yüzden kısıtlar İŞLEM BOYUNCA
// kapatılır — SQLite'ta `PRAGMA foreign_keys` bir transaction İÇİNDE etkisizdir,
// bu yüzden sıra: PRAGMA OFF → BEGIN → güncellemeler → COMMIT → PRAGMA ON →
// foreign_key_check ile doğrula.

import { getDb } from '@/db/database';
import { newId } from '@/lib/helpers';

// Kimliği yenilenecek tablolar ve o tabloyu İŞARET EDEN kolonlar.
// reminders.entity_id üç olası ebeveyni gösterir; entity_type ile ayrışır.
interface IdTable {
  table: string;
  refs: { table: string; column: string; where?: string }[];
}

const ID_TABLES: IdTable[] = [
  {
    table: 'goals',
    refs: [
      { table: 'habits', column: 'goal_id' },
      { table: 'goal_milestones', column: 'goal_id' },
      { table: 'goal_entries', column: 'goal_id' },
      { table: 'reminders', column: 'entity_id', where: "entity_type = 'goal'" },
    ],
  },
  {
    table: 'habits',
    refs: [
      { table: 'habit_logs', column: 'habit_id' },
      { table: 'reminders', column: 'entity_id', where: "entity_type = 'habit'" },
    ],
  },
  {
    table: 'tasks',
    refs: [
      { table: 'subtasks', column: 'task_id' },
      { table: 'reminders', column: 'entity_id', where: "entity_type = 'task'" },
    ],
  },
  // Çocuk tabloların KENDİ id'leri de yenilenir: onlar da buluta kendi
  // id'leriyle push edilir, dolayısıyla aynı çakışmayı yaşayabilirler.
  { table: 'habit_logs', refs: [] },
  { table: 'subtasks', refs: [] },
  { table: 'goal_milestones', refs: [] },
  { table: 'goal_entries', refs: [] },
  { table: 'reminders', refs: [] },
];

export interface ReassignResult {
  /** Tablo adı -> kimliği değişen satır sayısı. */
  counts: Record<string, number>;
  /** Eski id -> yeni id (yalnız ebeveyn tablolar; çağıran eşleme yapmak isterse). */
  habitIdMap: Map<string, string>;
}

// Tüm yerel veri satırlarına yeni id verir ve tüm iç referansları günceller.
// users tablosuna DOKUNULMAZ (senkronlanmaz, cihaz kimliğidir).
//
// Bu işlem yereldeki VERİYİ değiştirmez, yalnız kimliklerini. Çağıran ardından
// prepareFullResync + runSync ile veriyi yeni hesaba KOPYA olarak göndermelidir.
export function reassignLocalIds(): ReassignResult {
  const db = getDb();
  const counts: Record<string, number> = {};
  const habitIdMap = new Map<string, string>();

  // Kısıtlar transaction dışında kapatılmalı (SQLite kuralı).
  db.execSync('PRAGMA foreign_keys = OFF;');
  db.execSync('BEGIN;');
  try {
    for (const cfg of ID_TABLES) {
      const rows = db.getAllSync<{ id: string }>(`SELECT id FROM ${cfg.table}`);
      counts[cfg.table] = rows.length;
      for (const row of rows) {
        const next = newId();
        if (cfg.table === 'habits') habitIdMap.set(row.id, next);
        db.runSync(`UPDATE ${cfg.table} SET id = ? WHERE id = ?`, [next, row.id]);
        for (const ref of cfg.refs) {
          const filter = ref.where ? ` AND ${ref.where}` : '';
          db.runSync(
            `UPDATE ${ref.table} SET ${ref.column} = ? WHERE ${ref.column} = ?${filter}`,
            [next, row.id]
          );
        }
      }
    }
    db.execSync('COMMIT;');
  } catch (e) {
    try {
      db.execSync('ROLLBACK;');
    } catch {}
    db.execSync('PRAGMA foreign_keys = ON;');
    throw e;
  }
  db.execSync('PRAGMA foreign_keys = ON;');

  // Kısıtlar kapalıyken çalıştık: sonucun tutarlılığını AÇIKÇA doğrula.
  // (Sessiz bir kırık referans, ileride teşhisi çok zor hatalara dönüşür.)
  const broken = db.getAllSync<Record<string, unknown>>('PRAGMA foreign_key_check;');
  if (broken.length > 0) {
    throw new Error(`Kimlik yenileme sonrası ${broken.length} kırık referans bulundu`);
  }

  return { counts, habitIdMap };
}
