// ŞEMA ↔ SENKRON KOLON PARİTESİ.
//
// NEDEN VAR: syncEngine.TABLES elle bakılan bir liste ve yerel şemayla bağı
// derleyici tarafından denetlenmiyor. Bir migration yeni kolon eklerken bu
// listeyi güncellemeyi unutmak SESSİZ bir arıza üretir — kolon push'ta hiç
// gönderilmez, pull'da hiç yazılmaz, kayıt tek cihazda doğru görünmeye devam
// ederken ikinci cihazda varsayılana düşer. Ne tip denetimi, ne çalışma zamanı
// hatası, ne de kullanıcıya bir uyarı çıkar.
//
// Tam olarak bu oldu: goal_contribution ve goal_factor (migration010) senkron
// listesine hiç eklenmemişti; birim çarpanlı hedef katkısı ("4 bardak = 1 litre")
// ikinci cihazda per_completion'a düşüp bağlı hedefe yanlış ilerleme yazıyordu.
// Bu testler o hatayı yakalardı ve bundan sonraki her tekrarını yakalar.
//
// KURAL: senkronlanan kolon kümesi = yerel tablonun TÜM kolonları − LOCAL_ONLY.
// Yeni bir kolonun bilerek yerel kalması gerekiyorsa aşağıya AÇIKÇA eklenmeli;
// böylece "unutuldu" ile "bilerek dışarıda" ayrımı kodda görünür olur.

import { getDb } from '../../db/database';
import { resetTestDb } from '../../test/dbTestUtils';

// syncEngine, supabase istemcisini (dolayısıyla react-native'i) içeri alır.
// Bu testin ona ihtiyacı yok — yalnız TABLES tanımını okuyor (syncEngine.test.ts
// ile aynı taklit deseni; mock'lar import'tan ÖNCE gelmeli).
jest.mock('../supabase', () => ({ supabase: null }));
jest.mock('../auth', () => ({ ensureSignedIn: async () => null }));

// eslint-disable-next-line import/first
import { TABLES } from '../syncEngine';

// Senkronlanmayan yerel kolonlar (bilinçli).
//   synced — "buluta gönderilmeyi bekliyor mu" bayrağı; cihaza özeldir, uzak
//            tarafta karşılığı yoktur ve olmamalıdır.
const LOCAL_ONLY_COLUMNS = new Set(['synced']);

// Senkronlanmayan yerel tablolar (bilinçli).
//   users — cihaz kimliği; buluttaki kimlik auth.users'tır, bu tablo yalnız
//           yerel kullanıcı kaydını (anonim/hesaplı) tutar (bkz. userRepo).
const LOCAL_ONLY_TABLES = new Set(['users']);

function localColumns(table: string): string[] {
  return getDb()
    .getAllSync<{ name: string }>(`PRAGMA table_info(${table});`)
    .map((r) => r.name);
}

function localTables(): string[] {
  return getDb()
    .getAllSync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    )
    .map((r) => r.name);
}

beforeEach(async () => {
  await resetTestDb();
});

describe('senkron kolon paritesi', () => {
  it.each(TABLES.map((c) => [c.table, c] as const))(
    '%s: senkronlanan kolonlar yerel şemayla birebir örtüşür',
    (table, cfg) => {
      const expected = localColumns(table).filter((c) => !LOCAL_ONLY_COLUMNS.has(c));
      // Sıra önemli değil (SELECT/INSERT listesi kendi sırasını kullanır), küme önemli.
      expect([...cfg.cols].sort()).toEqual([...expected].sort());
    }
  );

  it('senkron listesi hiç var olmayan bir kolon istemiyor', () => {
    for (const cfg of TABLES) {
      const actual = new Set(localColumns(cfg.table));
      const ghosts = cfg.cols.filter((c) => !actual.has(c));
      expect({ table: cfg.table, ghosts }).toEqual({ table: cfg.table, ghosts: [] });
    }
  });

  it('senkronlanması gereken her tablo listede var (yeni tablo unutulmasın)', () => {
    const shouldSync = localTables().filter((t) => !LOCAL_ONLY_TABLES.has(t));
    expect([...TABLES.map((c) => c.table)].sort()).toEqual([...shouldSync].sort());
  });

  it('goal_contribution ve goal_factor senkronlanıyor (bu testin doğduğu hata)', () => {
    const habits = TABLES.find((c) => c.table === 'habits')!;
    expect(habits.cols).toContain('goal_contribution');
    expect(habits.cols).toContain('goal_factor');
  });

  it('yerelde NOT NULL olan her senkron kolonunun bir varsayılanı var', () => {
    // upsertLocal uzaktan gelen boş değeri `?? defaults ?? null` ile yazar. NOT NULL
    // bir kolonda varsayılan yoksa tek bir eksik alan pull'u fırlatır ve o
    // kullanıcının senkronu KALICI olarak kilitlenir (her tur aynı satırda patlar).
    // Tüm tablolar TEK seferde raporlanır: tablo tablo expect etmek ilk hatada
    // durur ve geri kalan eksikler bir sonraki koşuya kalırdı.
    const missing: Record<string, string[]> = {};
    for (const cfg of TABLES) {
      const cols = getDb()
        .getAllSync<{ name: string; notnull: number; dflt_value: string | null }>(
          `PRAGMA table_info(${cfg.table});`
        )
        // Yalnız yerel şemanın KENDİSİNİN bir varsayılan bildirdiği NOT NULL
        // kolonlar: fallback hem gerekli hem tartışmasız olan küme bu. Varsayılanı
        // olmayan NOT NULL kolonlar (goal_entries.amount gibi) kaydın yükü demektir
        // ve uydurulacak bir değerleri yoktur — uzak şemada da NOT NULL'dırlar.
        .filter((c) => c.notnull === 1 && c.dflt_value != null)
        .filter((c) => cfg.cols.includes(c.name))
        .filter((c) => cfg.defaults?.[c.name] === undefined)
        .map((c) => c.name);
      if (cols.length > 0) missing[cfg.table] = cols;
    }
    expect(missing).toEqual({});
  });
});
