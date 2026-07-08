// Senkron motoru — offline-first, son-yazan-kazanır (updated_at).
//
// Akış:
//   1) ensureSignedIn -> anonim uid
//   2) PUSH: her tabloda synced=0 satırları Supabase'e upsert et, synced=1 yap
//   3) PULL: son senkrondan beri değişen uzak satırları çek, updated_at'e göre
//      yereldekinden yeniyse uygula (silme dahil), synced=1 olarak yaz.
//      habit_logs'ta id farklı olsa bile (habit_id, log_date) çakışan kayıtlar
//      son-yazan-kazanır ile TEK kayda birleştirilir (naturalKey).
//
// Kimlik eşleme: yerel cihaz user_id'si korunur; push'ta user_id -> uid,
// pull'da user_id -> yerel id çevrilir. Böylece yerel veriyi yeniden yazmadan
// RLS (auth.uid() = user_id) sağlanır.
//
// FK sırası önemli: goals -> habits -> tasks -> habit_logs (ebeveyn önce).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb } from '../db/database';
import { supabase } from './supabase';
import { ensureSignedIn } from './auth';

interface TableCfg {
  table: string;       // yerel = uzak tablo adı
  cols: string[];      // senkronlanan kolonlar (yerel-only 'synced' hariç)
  hasUserId: boolean;  // user_id sınırda çevrilecek mi
  // Yerel UNIQUE kısıtı taşıyan "doğal anahtar" kolonları. İki cihaz aynı
  // mantıksal kaydı ayrı id'lerle üretebilir (ör. aynı alışkanlık aynı gün iki
  // cihazda işaretlenirse). Pull bu kolonlara göre çakışan kaydı bulup
  // son-yazan-kazanır ile birleştirir; yoksa INSERT yerel UNIQUE kısıtına
  // çarpar ve senkron o satırda kalıcı olarak kilitlenirdi.
  naturalKey?: string[];
}

// FK bağımlılığına göre sıralı (ebeveyn önce).
const TABLES: TableCfg[] = [
  {
    table: 'goals',
    cols: ['id', 'user_id', 'title', 'goal_type', 'target_value', 'current_value', 'unit', 'deadline', 'updated_at', 'deleted_at'],
    hasUserId: true,
  },
  {
    table: 'habits',
    cols: ['id', 'user_id', 'goal_id', 'title', 'kind', 'remind_at', 'icon', 'color', 'schedule', 'target_amount', 'unit', 'start_date', 'end_date', 'updated_at', 'deleted_at'],
    hasUserId: true,
  },
  {
    table: 'tasks',
    cols: ['id', 'user_id', 'title', 'due_date', 'priority', 'recurrence', 'completed_at', 'updated_at', 'deleted_at'],
    hasUserId: true,
  },
  {
    table: 'habit_logs',
    cols: ['id', 'habit_id', 'log_date', 'completed', 'amount', 'updated_at'],
    hasUserId: false,
    naturalKey: ['habit_id', 'log_date'], // yerel: UNIQUE(habit_id, log_date)
  },
  {
    table: 'subtasks',
    cols: ['id', 'task_id', 'title', 'completed', 'position', 'updated_at', 'deleted_at'],
    hasUserId: false, // sahiplik ebeveyn görev üzerinden (RLS de öyle)
  },
];

const LAST_PULLED_KEY = 'sync:lastPulledAt';

// Supabase tek yanıtta en fazla 1000 satır döndürür; fazlası sayfalanarak çekilir.
const PULL_PAGE_SIZE = 1000;

let inFlight = false; // aynı anda iki senkron çalışmasın

export interface SyncResult {
  status: 'ok' | 'disabled' | 'error';
  pushed?: number;
  pulled?: number;
  at?: number;        // epoch ms
  message?: string;   // hata mesajı
}

const ts = (s: string | null | undefined): number => (s ? new Date(s).getTime() : 0);

// Hesap değiştiğinde (giriş / çıkış) çağrılır. Tüm yerel satırları "gönderilmeyi
// bekliyor" (synced=0) yapar ve pull filigranını sıfırlar. Böylece:
//   - yerel veri yeni uid altına yeniden yüklenir (yeni hesabın yedeği olur),
//   - yeni hesabın bulutta zaten olan tüm verisi baştan çekilir.
// Bir sonraki runSync bu işi yapar.
export async function prepareFullResync(): Promise<void> {
  const db = getDb();
  for (const cfg of TABLES) {
    db.runSync(`UPDATE ${cfg.table} SET synced = 0`);
  }
  await AsyncStorage.removeItem(LAST_PULLED_KEY);
}

// Yerel kullanıcı VERİSİNİ tamamen siler (users/yerel kimlik korunur) ve pull
// filigranını sıfırlar. "Hesap DEĞİŞTİRME" semantiği içindir: farklı bir hesaba
// geçerken yereli temizleyip o hesabın bulut verisini baştan indirmek için —
// prepareFullResync'in (BİRLEŞTİRME: yereli de yukarı iter) aksine yereli yok eder.
// Yalnız "değiştir" akışında çağrılmalı; yanlış kullanımda veri kaybı olur.
// FK güvenliği: çocuk tablolar önce silinsin diye TABLES ters sırada gezilir.
export async function clearLocalData(): Promise<void> {
  const db = getDb();
  db.execSync('BEGIN;');
  try {
    for (const cfg of [...TABLES].reverse()) db.runSync(`DELETE FROM ${cfg.table}`);
    db.execSync('COMMIT;');
  } catch (e) {
    try {
      db.execSync('ROLLBACK;');
    } catch {}
    throw e;
  }
  await AsyncStorage.removeItem(LAST_PULLED_KEY);
}

// Bir tablonun bekleyen (synced=0) satırlarını buluta gönderir.
async function pushTable(cfg: TableCfg, uid: string): Promise<number> {
  const db = getDb();
  const rows = db.getAllSync<any>(
    `SELECT ${cfg.cols.join(', ')} FROM ${cfg.table} WHERE synced = 0`
  );
  if (rows.length === 0) return 0;

  const payload = rows.map((r) => (cfg.hasUserId ? { ...r, user_id: uid } : r));
  const { error } = await supabase!.from(cfg.table).upsert(payload, { onConflict: 'id' });
  if (error) throw new Error(`${cfg.table} push: ${error.message}`);

  // Yalnızca gönderdiğimiz haliyle aynı kalan satırları synced=1 yap.
  // updated_at değişmişse (arada düzenlenmiş) dokunma; sonraki turda gider.
  for (const r of rows) {
    db.runSync(
      `UPDATE ${cfg.table} SET synced = 1 WHERE id = ? AND updated_at = ?`,
      [r.id, r.updated_at]
    );
  }
  return rows.length;
}

// Yerele upsert (uzaktan gelen satır). synced=1 yazılır (uzakla aynı durumda).
function upsertLocal(cfg: TableCfg, obj: any): void {
  const db = getDb();
  const allCols = [...cfg.cols, 'synced'];
  const placeholders = allCols.map(() => '?').join(', ');
  const updates = cfg.cols
    .map((c) => `${c} = excluded.${c}`)
    .concat('synced = excluded.synced')
    .join(', ');
  const vals = cfg.cols.map((c) => obj[c] ?? null).concat(1);
  db.runSync(
    `INSERT INTO ${cfg.table} (${allCols.join(', ')}) VALUES (${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${updates}`,
    vals
  );
}

// Tek bir uzak satırı son-yazan-kazanır kuralıyla yerele uygular.
// Uygulandıysa true, yerel daha yeni olduğu için atlandıysa false döner.
function applyRemoteRow(cfg: TableCfg, r: any, localUserId: string): boolean {
  const db = getDb();
  const mapped = cfg.hasUserId ? { ...r, user_id: localUserId } : r;

  // 1) Aynı id yerelde varsa: klasik son-yazan-kazanır (eşitlikte yerel kalır).
  const byId = db.getFirstSync<any>(
    `SELECT updated_at FROM ${cfg.table} WHERE id = ?`,
    [r.id]
  );
  if (byId) {
    if (ts(byId.updated_at) >= ts(r.updated_at)) return false;
    upsertLocal(cfg, mapped);
    return true;
  }

  // 2) id yerelde yok ama doğal anahtar çakışıyorsa: iki cihaz aynı mantıksal
  // kaydı ayrı id'lerle üretmiş demektir. Kazanan updated_at ile seçilir;
  // uzak kazanırsa yereldeki rakip satır silinip uzak olan yazılır.
  if (cfg.naturalKey) {
    const where = cfg.naturalKey.map((k) => `${k} = ?`).join(' AND ');
    const rival = db.getFirstSync<any>(
      `SELECT id, updated_at FROM ${cfg.table} WHERE ${where}`,
      cfg.naturalKey.map((k) => r[k])
    );
    if (rival) {
      if (ts(rival.updated_at) >= ts(r.updated_at)) return false;
      db.runSync(`DELETE FROM ${cfg.table} WHERE id = ?`, [rival.id]);
    }
  }

  upsertLocal(cfg, mapped);
  return true;
}

// Son senkrondan beri değişen uzak satırları çekip son-yazan-kazanır uygular.
// Gördüğü en büyük updated_at'i döner (yeni filigran).
//
// Sayfalama şart: yanıt 1000 satırda kırpılırsa ve filigran yine de ilerlerse,
// kırpılan satırlar bir daha HİÇ çekilmez (sessiz veri kaybı). Bu yüzden tüm
// sayfalar bitene kadar döngü sürer.
async function pullTable(cfg: TableCfg, localUserId: string, since: string): Promise<{ count: number; maxUpdated: string }> {
  let maxUpdated = since;
  let count = 0;

  for (let from = 0; ; from += PULL_PAGE_SIZE) {
    // updated_at eşit satırlarda sayfa sınırı kararlı olsun diye id ikincil anahtar.
    const { data, error } = await supabase!
      .from(cfg.table)
      .select(cfg.cols.join(','))
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PULL_PAGE_SIZE - 1);
    if (error) throw new Error(`${cfg.table} pull: ${error.message}`);

    for (const remote of data ?? []) {
      const r = remote as any;
      if (applyRemoteRow(cfg, r, localUserId)) count++;
      if (ts(r.updated_at) > ts(maxUpdated)) maxUpdated = r.updated_at;
    }

    // Dolu olmayan sayfa = son sayfa.
    if (!data || data.length < PULL_PAGE_SIZE) break;
  }

  return { count, maxUpdated };
}

// Tam senkron turu: push hepsi, sonra pull hepsi.
export async function runSync(localUserId: string): Promise<SyncResult> {
  if (!supabase) return { status: 'disabled' };
  if (inFlight) return { status: 'error', message: 'Senkron zaten sürüyor' };
  inFlight = true;
  try {
    const uid = await ensureSignedIn();
    if (!uid) return { status: 'disabled' };

    // 1) PUSH (ebeveyn önce)
    let pushed = 0;
    for (const cfg of TABLES) pushed += await pushTable(cfg, uid);

    // 2) PULL (ebeveyn önce, FK için)
    const since = (await AsyncStorage.getItem(LAST_PULLED_KEY)) ?? '1970-01-01T00:00:00.000Z';
    let pulled = 0;
    let watermark = since;
    for (const cfg of TABLES) {
      const { count, maxUpdated } = await pullTable(cfg, localUserId, since);
      pulled += count;
      if (ts(maxUpdated) > ts(watermark)) watermark = maxUpdated;
    }
    if (ts(watermark) > ts(since)) {
      await AsyncStorage.setItem(LAST_PULLED_KEY, watermark);
    }

    return { status: 'ok', pushed, pulled, at: Date.now() };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  } finally {
    inFlight = false;
  }
}
