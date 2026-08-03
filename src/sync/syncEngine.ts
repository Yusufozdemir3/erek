// Senkron motoru — offline-first, son-yazan-kazanır (updated_at).
//
// Akış:
//   1) ensureSignedIn -> hesap uid'si; giriş yoksa null döner ve senkron
//      'disabled' ile çıkar (anonim oturum AÇILMAZ — bkz. sync/auth.ts).
//   2) PUSH: her tabloda synced=0 satırları Supabase'e upsert et, synced=1 yap
//   3) PULL: son senkrondan beri değişen uzak satırları çek, updated_at'e göre
//      yereldekinden yeniyse uygula (silme dahil), synced=1 olarak yaz.
//      habit_logs'ta id farklı olsa bile (habit_id, log_date) çakışan kayıtlar
//      son-yazan-kazanır ile TEK kayda birleştirilir (naturalKey).
//
// Zaman damgaları iki farklı iş görür, karıştırmayın:
//   - updated_at        : İSTEMCİ saati. Yalnız son-yazan-kazanır kıyası içindir.
//   - server_updated_at : SUNUCU saati (trigger). Yalnız pull filtresi + filigran.
// Filigran tablo başınadır (sync:lastPulledAt:<tablo>).
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
import { reassignLocalIds } from './localIds';

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
    cols: ['id', 'user_id', 'title', 'goal_type', 'target_value', 'current_value', 'unit', 'deadline', 'completed_at', 'remind_at', 'start_date', 'updated_at', 'deleted_at'],
    hasUserId: true,
  },
  {
    table: 'goal_milestones',
    cols: ['id', 'goal_id', 'title', 'completed', 'position', 'amount', 'due_date', 'updated_at', 'deleted_at'],
    hasUserId: false, // sahiplik ebeveyn hedef üzerinden (RLS de öyle)
  },
  {
    table: 'goal_entries',
    cols: ['id', 'goal_id', 'amount', 'updated_at', 'deleted_at'],
    hasUserId: false, // sahiplik ebeveyn hedef üzerinden (RLS de öyle)
  },
  {
    table: 'habits',
    cols: ['id', 'user_id', 'goal_id', 'title', 'kind', 'remind_at', 'icon', 'color', 'schedule', 'target_amount', 'unit', 'start_date', 'end_date', 'updated_at', 'deleted_at'],
    hasUserId: true,
  },
  {
    table: 'tasks',
    cols: ['id', 'user_id', 'title', 'due_date', 'end_time', 'priority', 'recurrence', 'remind_at', 'completed_at', 'updated_at', 'deleted_at'],
    hasUserId: true,
  },
  {
    table: 'reminders',
    cols: ['id', 'entity_type', 'entity_id', 'time', 'updated_at', 'deleted_at'],
    hasUserId: false, // sahiplik entity_type'a bağlı ebeveyn (habit/task/goal) üzerinden (RLS de öyle)
    // Yerelde UNIQUE kısıtı YOK ama mantıksal olarak bir varlığın aynı saatte iki
    // hatırlatması olamaz (form da eklemez). Doğal anahtar olmadan id'si farklı
    // gelen aynı hatırlatma İKİNCİ satır olarak eklenir -> bildirim iki kez çalar.
    naturalKey: ['entity_type', 'entity_id', 'time'],
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

// ESKİ tek-global filigran. Artık yazılmaz; yalnızca "varsa temizle" geçişinde
// okunur (bkz. migrateWatermarks).
const LEGACY_LAST_PULLED_KEY = 'sync:lastPulledAt';

// Filigran artık TABLO BAŞINA tutulur. Tek global filigran şu sessiz veri kaybını
// üretiyordu: tüm tablolar aynı `since` ile çekilip filigran TÜM tabloların
// maksimumuna set ediliyordu; bir tablonun daha eski zaman damgalı satırı sonraki
// turda `since`in gerisinde kalıp bir daha HİÇ çekilmiyordu.
const watermarkKey = (table: string) => `sync:lastPulledAt:${table}`;

const EPOCH = '1970-01-01T00:00:00.000Z';

// Pull filtresi/filigranı SUNUCU zaman damgasına bakar (trigger'la yazılır, bkz.
// supabase/schema.sql). `updated_at` istemci saatinden geldiği için ileri saatli
// bir cihaz filigranı zehirleyip aradaki tüm satırları atlatabiliyordu. Son-yazan-
// kazanır kıyası hâlâ `updated_at` ile yapılır (kaydın gerçekten ne zaman
// değiştiğini o söyler); sunucu damgası yalnızca "neyi çektim" defteridir.
const SERVER_TS_COL = 'server_updated_at';

// Supabase tek yanıtta en fazla 1000 satır döndürür; fazlası sayfalanarak çekilir.
const PULL_PAGE_SIZE = 1000;

// Bu cihazdaki verinin HANGİ bulut hesabına ait olduğu. Başarılı ilk senkrondan
// sonra yazılır ve hesap değişimini tespit etmenin tek güvenilir yoludur:
// yerel id'ler hesap değişince DEĞİŞMEZ, dolayısıyla A hesabına gönderilmiş bir
// satır B hesabıyla push edilmeye çalışıldığında RLS'in USING koşuluna takılır
// ve senkron kalıcı kilitlenir (sahada görüldü, 2026-07-23). Bu bayrak sayesinde
// çakışma OLUŞMADAN önce kullanıcıya "birleştir mi, değiştir mi" sorulur.
const OWNER_UID_KEY = 'sync:ownerUid';

let inFlight = false; // aynı anda iki senkron çalışmasın

export interface SyncResult {
  status: 'ok' | 'disabled' | 'error';
  pushed?: number;
  pulled?: number;
  at?: number;        // epoch ms
  message?: string;   // hata mesajı
  /** true ise hata, veri sahipliği çakışmasıdır (bkz. isOwnershipConflict). */
  ownershipConflict?: boolean;
}

// Bir giriş denemesinin yerel veri açısından ne anlama geldiği:
//   'fresh'  — bu cihazın verisi hiçbir hesaba gönderilmemiş; doğrudan bu hesaba
//              yüklenebilir (anonim kullanımdan hesaba geçişin normal yolu).
//   'same'   — zaten bu hesaba aitti; sıradan senkron.
//   'switch' — veri BAŞKA bir hesaba ait; kullanıcı "birleştir/değiştir" seçmeli.
export type SignInKind = 'fresh' | 'same' | 'switch';

export async function getSyncOwner(): Promise<string | null> {
  return AsyncStorage.getItem(OWNER_UID_KEY);
}

export async function setSyncOwner(uid: string): Promise<void> {
  await AsyncStorage.setItem(OWNER_UID_KEY, uid);
}

// Giriş yapılacak hesabın yerel veriyle ilişkisini sınıflandırır.
export async function classifySignIn(uid: string): Promise<SignInKind> {
  const owner = await getSyncOwner();
  if (owner === null) return 'fresh';
  return owner === uid ? 'same' : 'switch';
}

// Postgres'in RLS reddini tanır. Push, upsert(onConflict: id) olduğu için var
// olan satırı GÜNCELLEMEYE çalışır; satır başka bir uid'e aitse USING koşulu
// engeller. Ham mesaj kullanıcıya hiçbir şey anlatmadığından (ve çözümü de
// söylemediğinden) çağıran bunu yakalayıp anlaşılır bir seçim sunar.
export function isOwnershipConflict(message: string): boolean {
  return (
    message.includes('row-level security') ||
    message.includes('violates row-level security policy')
  );
}

const ts = (s: string | null | undefined): number => (s ? new Date(s).getTime() : 0);

// Tüm filigranları siler (hesap değişimi / tam yeniden senkron).
async function clearWatermarks(): Promise<void> {
  await AsyncStorage.multiRemove([
    LEGACY_LAST_PULLED_KEY,
    ...TABLES.map((c) => watermarkKey(c.table)),
  ]);
}

// Tek-global filigrandan tablo-başına filigrana geçiş. Eski anahtarı tablolara
// KOPYALAMIYORUZ bilerek: eski şema zaten bazı tabloların satırlarını atlamış
// olabilir, o değeri devralmak kaybı kalıcılaştırırdı. Bunun yerine eski anahtar
// silinir ve tablolar bir kez epoch'tan çekilir (pull idempotent: son-yazan-kazanır,
// yerelde daha yeni olan satır ezilmez) — atlanmış satırlar böyle iyileşir.
async function migrateWatermarks(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_LAST_PULLED_KEY);
}

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
  await clearWatermarks();
}

// — HESAP DEĞİŞİMİNİN İKİ ÇÖZÜM YOLU —
// İkisi de yalnız hazırlıktır: veriyi asıl taşıyan bir sonraki runSync'tir.
//
// BİRLEŞTİR (fork): yerel veri YENİ hesaba da girsin isteniyor. Satırlara yeni
// id verilir (bkz. localIds.ts) — böylece push, var olan satırı güncellemeye
// çalışmaz, EKLER; eski hesabın buluttaki satırlarına dokunulmaz ve RLS
// çakışması matematiksel olarak imkânsız hale gelir. Yerel veri korunur.
export async function prepareMergeIntoAccount(): Promise<void> {
  reassignLocalIds();
  await prepareFullResync();
  // Zamanlayıcı durumu eski alışkanlık id'sini tutuyor; kimlikler değiştiği için
  // artık hiçbir satıra denk gelmez -> commit ederse veri kaybolur. Sıfırla.
  await AsyncStorage.removeItem('timer:active');
}

// DEĞİŞTİR: cihaz, girilen hesabın aynası olsun isteniyor. Yerel veri SİLİNİR
// ve o hesabın bulut verisi baştan indirilir. Geri alınamaz — çağıran onay
// almadan kullanmamalı.
export async function prepareReplaceWithAccount(): Promise<void> {
  await clearLocalData();
  await AsyncStorage.removeItem('timer:active');
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
  await clearWatermarks();
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
async function pullTable(cfg: TableCfg, localUserId: string, since: string): Promise<{ count: number; maxServerTs: string }> {
  let maxServerTs = since;
  let count = 0;

  for (let from = 0; ; from += PULL_PAGE_SIZE) {
    // Sunucu damgası eşit satırlarda sayfa sınırı kararlı olsun diye id ikincil anahtar.
    const { data, error } = await supabase!
      .from(cfg.table)
      .select([...cfg.cols, SERVER_TS_COL].join(','))
      .gt(SERVER_TS_COL, since)
      .order(SERVER_TS_COL, { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PULL_PAGE_SIZE - 1);
    if (error) {
      // Kolon yoksa şema eskidir: supabase/schema.sql yeniden çalıştırılmalı.
      const hint = error.message.includes(SERVER_TS_COL)
        ? ` (Supabase şeması eski görünüyor — supabase/schema.sql'i yeniden çalıştırın)`
        : '';
      throw new Error(`${cfg.table} pull: ${error.message}${hint}`);
    }

    for (const remote of data ?? []) {
      const r = remote as any;
      if (applyRemoteRow(cfg, r, localUserId)) count++;
      if (ts(r[SERVER_TS_COL]) > ts(maxServerTs)) maxServerTs = r[SERVER_TS_COL];
    }

    // Dolu olmayan sayfa = son sayfa.
    if (!data || data.length < PULL_PAGE_SIZE) break;
  }

  return { count, maxServerTs };
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

    // 2) PULL (ebeveyn önce, FK için) — her tablo KENDİ filigranından sürer.
    await migrateWatermarks();
    let pulled = 0;
    for (const cfg of TABLES) {
      const since = (await AsyncStorage.getItem(watermarkKey(cfg.table))) ?? EPOCH;
      const { count, maxServerTs } = await pullTable(cfg, localUserId, since);
      pulled += count;
      if (ts(maxServerTs) > ts(since)) {
        await AsyncStorage.setItem(watermarkKey(cfg.table), maxServerTs);
      }
    }

    // Buradan sonra bu cihazın verisi bu hesaba aittir; hesap değişimi ancak
    // bu bayrak sayesinde çakışma OLUŞMADAN fark edilebilir.
    await setSyncOwner(uid);
    return { status: 'ok', pushed, pulled, at: Date.now() };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      status: 'error',
      message,
      ownershipConflict: isOwnershipConflict(message),
    };
  } finally {
    inFlight = false;
  }
}
