// syncEngine testleri: push/pull akışı, son-yazan-kazanır, kimlik eşleme,
// filigran (watermark) ve 1000+ kayıtta sayfalama.
//
// Supabase ve auth taklit edilir; SQLite tarafı gerçek şemayla (in-memory) çalışır.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb } from '../../db/database';
import { habitRepo } from '../../db/repositories/habitRepo';
import { userRepo } from '../../db/repositories/userRepo';
import { resetTestDb } from '../../test/dbTestUtils';

const mockFrom = jest.fn();
const mockEnsureSignedIn = jest.fn();

jest.mock('../supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));
jest.mock('../auth', () => ({
  ensureSignedIn: () => mockEnsureSignedIn(),
}));

// jest.mock'lardan SONRA import edilmeli ki taklitler devreye girsin.
import { prepareFullResync, runSync } from '../syncEngine';

const LAST_PULLED_KEY = 'sync:lastPulledAt';
const UID = 'remote-uid';

type Row = Record<string, unknown>;

// Sahte uzak durum + çağrı kayıtları. Her testte sıfırlanır.
let remoteData: Record<string, Row[]>;
let upserts: Array<{ table: string; payload: Row[] }>;
let upsertErrorTable: string | null;
let gtCalls: Array<{ table: string; since: string }>;
let rangeCalls: Array<{ table: string; from: number; to: number }>;

// Gerçek PostgREST zincirini taklit eder:
//   .from(t).upsert(rows)  ve  .from(t).select().gt().order().order().range()
// range() Supabase gibi dilimler: sıralı sonuç kümesinden [from, to] aralığı.
function fakeFrom(table: string) {
  return {
    upsert: async (payload: Row[]) => {
      upserts.push({ table, payload });
      if (upsertErrorTable === table) return { error: { message: 'upsert patladı' } };
      return { error: null };
    },
    select: () => {
      let since = '';
      const q = {
        gt: (_col: string, value: string) => {
          since = value;
          gtCalls.push({ table, since: value });
          return q;
        },
        order: () => q,
        range: async (from: number, to: number) => {
          rangeCalls.push({ table, from, to });
          const rows = (remoteData[table] ?? [])
            .filter((r) => String(r.updated_at) > since)
            .sort((a, b) => {
              const u = String(a.updated_at).localeCompare(String(b.updated_at));
              return u !== 0 ? u : String(a.id).localeCompare(String(b.id));
            });
          return { data: rows.slice(from, to + 1), error: null };
        },
      };
      return q;
    },
  };
}

// Tüm kolonları dolu bir uzak habit satırı (upsertLocal NOT NULL kolon bekler).
function remoteHabit(overrides: Row & { id: string; updated_at: string }): Row {
  return {
    user_id: UID,
    goal_id: null,
    title: 'Uzak alışkanlık',
    remind_at: null,
    icon: null,
    color: null,
    schedule: null,
    target_amount: null,
    unit: null,
    deleted_at: null,
    ...overrides,
  };
}

function isoShift(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function syncedFlags(table: string): number[] {
  return getDb()
    .getAllSync<{ synced: number }>(`SELECT synced FROM ${table}`)
    .map((r) => r.synced);
}

beforeEach(async () => {
  remoteData = {};
  upserts = [];
  upsertErrorTable = null;
  gtCalls = [];
  rangeCalls = [];
  mockFrom.mockImplementation(fakeFrom);
  mockEnsureSignedIn.mockResolvedValue(UID);
  await AsyncStorage.clear();
  await resetTestDb();
});

describe('runSync — push', () => {
  it('bekleyen satırları FK sırasıyla gönderir, user_id\'yi uid\'e çevirir, synced=1 yapar', async () => {
    const user = userRepo.getOrCreateLocal();
    const habit = habitRepo.create({ user_id: user.id, title: 'Su iç' });
    habitRepo.toggleLog(habit.id, '2026-07-01', true);

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    expect(result.pushed).toBe(2); // 1 habit + 1 log (users tablosu senkronlanmaz)

    // Yalnızca bekleyeni olan tablolar, ebeveyn önce.
    expect(upserts.map((u) => u.table)).toEqual(['habits', 'habit_logs']);
    // Yerel user_id sınırda uid'e çevrildi.
    expect(upserts[0].payload[0].user_id).toBe(UID);
    expect(upserts[0].payload[0].id).toBe(habit.id);

    expect(syncedFlags('habits')).toEqual([1]);
    expect(syncedFlags('habit_logs')).toEqual([1]);
  });

  it('push hatasında sonuç error döner ve tabloyu söyler', async () => {
    const user = userRepo.getOrCreateLocal();
    habitRepo.create({ user_id: user.id, title: 'Su iç' });
    upsertErrorTable = 'habits';

    const result = await runSync(user.id);

    expect(result.status).toBe('error');
    expect(result.message).toContain('habits push');
    // Hata alan satır bekliyor kalır, sonraki turda yeniden denenir.
    expect(syncedFlags('habits')).toEqual([0]);
  });
});

describe('runSync — pull', () => {
  it('uzaktaki yeni kaydı yerele ekler, user_id\'yi yerel kimliğe çevirir', async () => {
    const user = userRepo.getOrCreateLocal();
    remoteData['habits'] = [
      remoteHabit({ id: 'uzak-1', title: 'Buluttan gelen', updated_at: isoShift(0) }),
    ];

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    expect(result.pulled).toBe(1);

    const pulled = habitRepo.getById('uzak-1')!;
    expect(pulled.title).toBe('Buluttan gelen');
    expect(pulled.user_id).toBe(user.id); // uid değil, yerel kimlik
    expect(pulled.synced).toBe(1);
  });

  it('son yazan kazanır: yeni uzak satır uygulanır, eski uzak satır yok sayılır', async () => {
    const user = userRepo.getOrCreateLocal();
    const a = habitRepo.create({ user_id: user.id, title: 'Yerel A' });
    const b = habitRepo.create({ user_id: user.id, title: 'Yerel B' });

    remoteData['habits'] = [
      remoteHabit({ id: a.id, title: 'Bulut A (daha yeni)', updated_at: isoShift(3600_000) }),
      remoteHabit({ id: b.id, title: 'Bulut B (daha eski)', updated_at: isoShift(-3600_000) }),
    ];

    const result = await runSync(user.id);

    expect(result.pulled).toBe(1);
    expect(habitRepo.getById(a.id)!.title).toBe('Bulut A (daha yeni)');
    expect(habitRepo.getById(b.id)!.title).toBe('Yerel B');
  });

  it('filigranı görülen en yeni updated_at\'e taşır ve sonraki tur oradan sürer', async () => {
    const user = userRepo.getOrCreateLocal();
    const t1 = isoShift(0);
    remoteData['habits'] = [remoteHabit({ id: 'uzak-1', updated_at: t1 })];

    await runSync(user.id);
    expect(await AsyncStorage.getItem(LAST_PULLED_KEY)).toBe(t1);

    gtCalls = [];
    await runSync(user.id);
    // İkinci tur tüm tablolarda epoch'tan değil filigrandan sorar.
    expect(gtCalls.length).toBeGreaterThan(0);
    for (const call of gtCalls) expect(call.since).toBe(t1);
  });

  it('aynı anda ikinci senkron reddedilir (inFlight kilidi)', async () => {
    const user = userRepo.getOrCreateLocal();
    const first = runSync(user.id);
    const second = await runSync(user.id);
    expect(second.status).toBe('error');
    expect(second.message).toContain('zaten sürüyor');
    expect((await first).status).toBe('ok');
  });
});

describe('runSync — sayfalama (1000+ kayıt)', () => {
  it('1001 uzak log iki sayfada eksiksiz çekilir', async () => {
    const user = userRepo.getOrCreateLocal();
    const habit = habitRepo.create({ user_id: user.id, title: 'Su iç' });

    // 1001 gün: log_date benzersiz (UNIQUE), updated_at artan (sayfa sırası).
    const dayMs = 86_400_000;
    const base = Date.parse('2026-01-01T00:00:00.000Z');
    remoteData['habit_logs'] = Array.from({ length: 1001 }, (_, i) => ({
      id: `log-${String(i).padStart(4, '0')}`,
      habit_id: habit.id,
      log_date: new Date(base + i * dayMs).toISOString().slice(0, 10),
      completed: 1,
      amount: 0,
      updated_at: new Date(base + i * 1000).toISOString(),
    }));

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    expect(result.pulled).toBe(1001);

    // habit_logs için iki sayfa istendi: [0,999] ve [1000,1999].
    const logRanges = rangeCalls.filter((c) => c.table === 'habit_logs');
    expect(logRanges).toEqual([
      { table: 'habit_logs', from: 0, to: 999 },
      { table: 'habit_logs', from: 1000, to: 1999 },
    ]);

    const count = getDb().getFirstSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM habit_logs`
    );
    expect(count?.n).toBe(1001);

    // Filigran son (en yeni) satıra taşındı — kırpılma kaynaklı kayıp yok.
    const lastUpdated = new Date(base + 1000 * 1000).toISOString();
    expect(await AsyncStorage.getItem(LAST_PULLED_KEY)).toBe(lastUpdated);
  });
});

describe('runSync — habit_logs doğal anahtar birleştirme', () => {
  // İki cihaz aynı alışkanlığı aynı gün ayrı id'lerle loglayabilir. Eski davranış
  // bu durumda UNIQUE(habit_id, log_date) ihlaliyle senkronu kalıcı kilitliyordu;
  // artık kayıtlar son-yazan-kazanır ile tek kayda birleşmeli.
  it('farklı id\'li ama aynı gün+alışkanlık uzak log yeniyse yereldekinin yerine geçer', async () => {
    const user = userRepo.getOrCreateLocal();
    const habit = habitRepo.create({ user_id: user.id, title: 'Su iç' });
    habitRepo.toggleLog(habit.id, '2026-07-01', false); // yerel: completed=0

    remoteData['habit_logs'] = [{
      id: 'uzak-log-1',
      habit_id: habit.id,
      log_date: '2026-07-01',
      completed: 1,
      amount: 0,
      updated_at: isoShift(3600_000), // yereldekinden yeni
    }];

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    expect(result.pulled).toBe(1);
    // Tek kayıt kaldı: uzak olan kazandı, yerel rakip silindi.
    const rows = getDb().getAllSync<any>(`SELECT id, completed, synced FROM habit_logs`);
    expect(rows).toEqual([{ id: 'uzak-log-1', completed: 1, synced: 1 }]);
  });

  it('uzak log eskiyse yerel kalır ve UNIQUE ihlali oluşmaz', async () => {
    const user = userRepo.getOrCreateLocal();
    const habit = habitRepo.create({ user_id: user.id, title: 'Su iç' });
    habitRepo.toggleLog(habit.id, '2026-07-01', true); // yerel: completed=1 (şimdi)
    const localId = getDb().getFirstSync<any>(`SELECT id FROM habit_logs`)!.id;

    remoteData['habit_logs'] = [{
      id: 'uzak-log-2',
      habit_id: habit.id,
      log_date: '2026-07-01',
      completed: 0,
      amount: 0,
      updated_at: isoShift(-3600_000), // yereldekinden eski
    }];

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    expect(result.pulled).toBe(0);
    const rows = getDb().getAllSync<any>(`SELECT id, completed FROM habit_logs`);
    expect(rows).toEqual([{ id: localId, completed: 1 }]);
  });
});

describe('prepareFullResync', () => {
  it('tüm satırları yeniden bekletir ve filigranı sıfırlar', async () => {
    const user = userRepo.getOrCreateLocal();
    habitRepo.create({ user_id: user.id, title: 'Su iç' });
    remoteData['habits'] = [remoteHabit({ id: 'uzak-1', updated_at: isoShift(0) })];

    await runSync(user.id);
    expect(await AsyncStorage.getItem(LAST_PULLED_KEY)).not.toBeNull();
    expect(syncedFlags('habits')).toEqual([1, 1]);

    await prepareFullResync();

    expect(await AsyncStorage.getItem(LAST_PULLED_KEY)).toBeNull();
    expect(syncedFlags('habits')).toEqual([0, 0]);
  });
});

describe('runSync — devre dışı durumlar', () => {
  it('oturum açılamazsa disabled döner ve hiçbir şey göndermez', async () => {
    mockEnsureSignedIn.mockResolvedValue(null);
    const user = userRepo.getOrCreateLocal();
    habitRepo.create({ user_id: user.id, title: 'Su iç' });

    const result = await runSync(user.id);

    expect(result.status).toBe('disabled');
    expect(upserts).toHaveLength(0);
    expect(syncedFlags('habits')).toEqual([0]);
  });
});
