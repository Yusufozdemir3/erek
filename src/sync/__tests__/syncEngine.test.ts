// syncEngine testleri: push/pull akışı, son-yazan-kazanır, kimlik eşleme,
// filigran (watermark) ve 1000+ kayıtta sayfalama.
//
// Supabase ve auth taklit edilir; SQLite tarafı gerçek şemayla (in-memory) çalışır.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb } from '../../db/database';
import { habitRepo } from '../../db/repositories/habitRepo';
import { goalRepo } from '../../db/repositories/goalRepo';
import { goalEntryRepo } from '../../db/repositories/goalEntryRepo';
import { taskRepo } from '../../db/repositories/taskRepo';
import { subtaskRepo } from '../../db/repositories/subtaskRepo';
import { reminderRepo } from '../../db/repositories/reminderRepo';
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
import {
  classifySignIn,
  clearLocalData,
  isOwnershipConflict,
  prepareFullResync,
  prepareMergeIntoAccount,
  prepareReplaceWithAccount,
  runSync,
  setSyncOwner,
} from '../syncEngine';

const LEGACY_KEY = 'sync:lastPulledAt';
// syncEngine'deki WATERMARK_SAFETY_MS ile aynı olmalı: filigran, görülen en büyük
// sunucu damgasının bu kadar gerisine kurulur (sırasız commit'ler atlanmasın diye).
const WATERMARK_SAFETY_MS = 5_000;
const wmKey = (table: string) => `sync:lastPulledAt:${table}`;
const EPOCH = '1970-01-01T00:00:00.000Z';
const UID = 'remote-uid';

type Row = Record<string, unknown>;

// Sahte uzak durum + çağrı kayıtları. Her testte sıfırlanır.
let remoteData: Record<string, Row[]>;
let upserts: Array<{ table: string; payload: Row[] }>;
let upsertErrorTable: string | null;
let upsertErrorMessage: string;
// Push artık parti parti gidiyor (bkz. PUSH_PAGE_SIZE), yani bir tabloya birden
// çok upsert isteği düşebilir. null = o tablonun TÜM istekleri patlar (eski
// davranış); sayı verilirse yalnızca o sıradaki (1'den başlayarak) istek patlar.
let upsertErrorAtCall: number | null;
let gtCalls: Array<{ table: string; since: string }>;
let rangeCalls: Array<{ table: string; from: number; to: number }>;

// Sunucunun trigger'la yazdığı damga (bkz. supabase/schema.sql). Fixture'lar
// vermezse sunucunun kaydı istemciyle aynı anda aldığı varsayılır.
const serverTs = (r: Row): string => String(r.server_updated_at ?? r.updated_at);

// Gerçek PostgREST zincirini taklit eder:
//   .from(t).upsert(rows)  ve  .from(t).select().gt().order().order().range()
// range() Supabase gibi dilimler: sıralı sonuç kümesinden [from, to] aralığı.
// Filtre/sıralama gt()'ye verilen kolona göre yapılır (motor server_updated_at kullanır).
function fakeFrom(table: string) {
  return {
    upsert: async (payload: Row[]) => {
      upserts.push({ table, payload });
      const nth = upserts.filter((u) => u.table === table).length;
      if (upsertErrorTable === table && (upsertErrorAtCall == null || upsertErrorAtCall === nth)) {
        return { error: { message: upsertErrorMessage } };
      }
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
            .filter((r) => serverTs(r) > since)
            .sort((a, b) => {
              const u = serverTs(a).localeCompare(serverTs(b));
              return u !== 0 ? u : String(a.id).localeCompare(String(b.id));
            })
            .map((r) => ({ server_updated_at: serverTs(r), ...r }));
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
    kind: 'binary',
    remind_at: null,
    icon: null,
    color: null,
    schedule: null,
    target_amount: null,
    unit: null,
    start_date: null,
    end_date: null,
    // Bağlı hedefe katkı ayarları — gerçek bir bulut satırı bunları taşır
    // (goal_factor uzak şemada NOT NULL DEFAULT 1).
    goal_contribution: null,
    goal_factor: 1,
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
  upsertErrorMessage = 'upsert patladı';
  upsertErrorAtCall = null;
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

// Uzun süredir kullanan birinde bekleyen satır sayısı binleri bulabilir
// (prepareFullResync her girişte HEPSİNİ synced=0 yapar). Tek dev istek mobil
// şebekede zaman aşımına düşerse hep-ya-hiç davranışı senkronu kalıcı olarak
// kilitliyordu — parti parti gönderim bunu kırar.
describe('runSync — push partileri (büyük birikim)', () => {
  // Tek alışkanlığa `count` ayrı güne log yazar (UNIQUE(habit_id, log_date)).
  function seedLogs(userId: string, count: number): void {
    const habit = habitRepo.create({ user_id: userId, title: 'Su iç' });
    const dayMs = 86_400_000;
    const base = Date.parse('2026-01-01T00:00:00.000Z');
    for (let i = 0; i < count; i++) {
      habitRepo.toggleLog(habit.id, new Date(base + i * dayMs).toISOString().slice(0, 10), true);
    }
  }

  it('600 bekleyen satır tek istek yerine 250\'lik partilerde gider', async () => {
    const user = userRepo.getOrCreateLocal();
    seedLogs(user.id, 600);

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    const logPushes = upserts.filter((u) => u.table === 'habit_logs');
    expect(logPushes.map((u) => u.payload.length)).toEqual([250, 250, 100]);
    // Hiçbir satır atlanmadı.
    expect(syncedFlags('habit_logs')).toHaveLength(600);
    expect(syncedFlags('habit_logs').every((f) => f === 1)).toBe(true);
  });

  it('ortadaki parti patlarsa ÖNCEKİ partiler işaretli kalır (ilerleme korunur)', async () => {
    const user = userRepo.getOrCreateLocal();
    seedLogs(user.id, 600);
    upsertErrorTable = 'habit_logs';
    upsertErrorAtCall = 2; // ilk parti geçer, ikincisi patlar

    const result = await runSync(user.id);

    expect(result.status).toBe('error');
    expect(result.message).toContain('habit_logs push');

    // KRİTİK: parti yokken bu sayı 0 olurdu ve her tur baştan başlardı.
    const flags = syncedFlags('habit_logs');
    expect(flags.filter((f) => f === 1)).toHaveLength(250);
    expect(flags.filter((f) => f === 0)).toHaveLength(350);
  });

  it('yeniden denemede yalnızca KALAN satırlar gönderilir', async () => {
    const user = userRepo.getOrCreateLocal();
    seedLogs(user.id, 600);
    upsertErrorTable = 'habit_logs';
    upsertErrorAtCall = 2;
    await runSync(user.id); // 250 geçti, 350 bekliyor

    upsertErrorTable = null;
    upserts = [];
    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    // 350 kalan → 250 + 100; ilk turdaki 250 tekrar GÖNDERİLMEZ.
    const logPushes = upserts.filter((u) => u.table === 'habit_logs');
    expect(logPushes.map((u) => u.payload.length)).toEqual([250, 100]);
    expect(syncedFlags('habit_logs').every((f) => f === 1)).toBe(true);
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

  it('filigranı görülen en yeni damganın GÜVENLİK PAYI gerisine taşır ve sonraki tur oradan sürer', async () => {
    const user = userRepo.getOrCreateLocal();
    const t1 = isoShift(0);
    remoteData['habits'] = [remoteHabit({ id: 'uzak-1', updated_at: t1 })];

    await runSync(user.id);
    // Tam olarak en büyük damgaya kurulsaydı, o damgadan biraz ÖNCE başlayıp
    // SONRA commit eden eşzamanlı bir işlemin satırı kalıcı olarak atlanırdı
    // (server_updated_at = now() ve now() transaction BAŞLANGICI'dır).
    const stored = (await AsyncStorage.getItem(wmKey('habits')))!;
    expect(new Date(stored).getTime()).toBe(new Date(t1).getTime() - WATERMARK_SAFETY_MS);

    gtCalls = [];
    await runSync(user.id);
    // Yalnız habits kendi filigranından sürer; satır görmemiş tablolar epoch'ta kalır.
    expect(gtCalls.find((c) => c.table === 'habits')!.since).toBe(stored);
    for (const call of gtCalls.filter((c) => c.table !== 'habits')) {
      expect(call.since).toBe(EPOCH);
    }
  });

  it('güvenlik payı sayesinde SIRASIZ commit edilen satır bir sonraki turda yakalanır', async () => {
    // Senaryo: iki işlem eşzamanlı. Geç başlayan ÖNCE commit ediyor (büyük damga),
    // erken başlayan SONRA (küçük damga). İlk tur yalnız büyük damgalıyı görür.
    const user = userRepo.getOrCreateLocal();
    const late = isoShift(0);
    const early = new Date(new Date(late).getTime() - 2000).toISOString(); // pay içinde
    remoteData['habits'] = [remoteHabit({ id: 'gec-commit', updated_at: late })];

    await runSync(user.id);
    expect(habitRepo.getById('gec-commit')).not.toBeNull();

    // Gecikmiş işlem şimdi commit etti: damgası daha KÜÇÜK.
    remoteData['habits'].push(remoteHabit({ id: 'erken-baslayan', updated_at: early }));
    await runSync(user.id);

    // Pay bırakılmasaydı bu satır `> since` koşuluna hiç uymaz ve sonsuza dek
    // atlanırdı (sessiz veri kaybı).
    expect(habitRepo.getById('erken-baslayan')).not.toBeNull();
  });

  it('filigran TABLO BAŞINA tutulur: bir tablonun yeni satırı diğerinin eski satırını atlatmaz', async () => {
    // Eski hata: tek global filigran tüm tabloların maksimumuna set ediliyordu.
    // tasks 10:09'a kadar ilerleyince goals'un 10:05'lik satırı bir daha çekilmiyordu.
    const user = userRepo.getOrCreateLocal();
    const early = '2026-07-23T10:05:00.000Z';
    const late = '2026-07-23T10:09:00.000Z';

    remoteData['tasks'] = [{
      id: 'uzak-gorev', user_id: UID, title: 'Geç damgalı görev', due_date: null,
      end_time: null, priority: 'medium', recurrence: null, remind_at: null,
      completed_at: null, updated_at: late, deleted_at: null,
    }];

    await runSync(user.id); // tasks filigranı late'e çıkar, goals epoch'ta kalır

    // goals'a ancak ŞİMDİ görünen ama damgası daha ESKİ olan bir satır düşsün.
    remoteData['goals'] = [{
      id: 'uzak-hedef', user_id: UID, title: 'Erken damgalı hedef', goal_type: 'numeric',
      target_value: 10, current_value: 0, unit: null, deadline: null, completed_at: null,
      remind_at: null, start_date: null, updated_at: early, deleted_at: null,
    }];

    const result = await runSync(user.id);

    expect(result.pulled).toBe(1);
    expect(goalRepo.getById('uzak-hedef')?.title).toBe('Erken damgalı hedef');
  });

  it('eski tek-global filigran temizlenir (geçiş: tablolar bir kez epoch\'tan çekilir)', async () => {
    const user = userRepo.getOrCreateLocal();
    await AsyncStorage.setItem(LEGACY_KEY, '2026-07-23T10:00:00.000Z');

    await runSync(user.id);

    expect(await AsyncStorage.getItem(LEGACY_KEY)).toBeNull();
    // Eski değer devralınmadı: atlanmış olabilecek satırlar iyileşsin diye epoch.
    for (const call of gtCalls) expect(call.since).toBe(EPOCH);
  });

  it('aynı anda ikinci senkron reddedilir (inFlight kilidi)', async () => {
    const user = userRepo.getOrCreateLocal();
    const first = runSync(user.id);
    const second = await runSync(user.id);
    // 'error' DEĞİL 'busy': çakışma bir arıza değil, çağıranın sessizce
    // yok sayması gereken bir durum (bkz. SyncResult).
    expect(second.status).toBe('busy');
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
    // (Güvenlik payı kadar geride; bkz. WATERMARK_SAFETY_MS.)
    const lastUpdated = new Date(base + 1000 * 1000).toISOString();
    const stored = (await AsyncStorage.getItem(wmKey('habit_logs')))!;
    expect(new Date(stored).getTime()).toBe(new Date(lastUpdated).getTime() - WATERMARK_SAFETY_MS);
  });
});

describe('runSync — reminders doğal anahtar birleştirme', () => {
  // Yerel id'ler migration016'da tiresiz 32 karakter üretilmişti; Postgres uuid
  // kolonu onları TİRELİ geri veriyor. id eşleşmeyince aynı hatırlatma ikinci kez
  // eklenip bildirim iki kez çalıyordu. Doğal anahtar (entity_type, entity_id, time)
  // bu kopyayı birleştirir.
  it('id\'si farklı ama aynı varlık+saat uzak hatırlatma kopya satır yaratmaz', async () => {
    const user = userRepo.getOrCreateLocal();
    const habit = habitRepo.create({ user_id: user.id, title: 'Su iç' });
    reminderRepo.create('habit', habit.id, '08:30');

    remoteData['reminders'] = [{
      id: '11111111-2222-3333-4444-555555555555', // aynı hatırlatmanın kanonik id'si
      entity_type: 'habit',
      entity_id: habit.id,
      time: '08:30',
      updated_at: isoShift(3600_000), // yereldekinden yeni -> uzak kazanır
      deleted_at: null,
    }];

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    const rows = reminderRepo.listByEntity('habit', habit.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('11111111-2222-3333-4444-555555555555');
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

// Bağlı hedefe katkı ayarları (goal_contribution/goal_factor) uzun süre senkron
// kolon listesinde YOKTU: alışkanlığı kuran cihazda "4 bardak = 1 litre" doğru
// çalışırken, aynı hesabın ikinci cihazına satır varsayılanlarla (per_completion,
// çarpan 1) iniyordu — o cihazda her işaretleme hedefe 0.25 yerine +1 yazıyordu.
// Yapısal koruma __tests__/syncColumnParity.test.ts'te; buradakiler DAVRANIŞI
// (gerçekten gidip geliyor mu) doğrular.
describe('runSync — bağlı hedef katkı ayarları', () => {
  it('push: katkı biçimi ve çarpan payload\'a girer', async () => {
    const user = userRepo.getOrCreateLocal();
    const goal = goalRepo.create({ user_id: user.id, title: 'Su', goal_type: 'numeric', target_value: 2 });
    habitRepo.create({
      user_id: user.id,
      title: 'Su iç',
      kind: 'numeric',
      goal_id: goal.id,
      goal_contribution: 'amount',
      goal_factor: 0.25,
    });

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    const habitPush = upserts.find((u) => u.table === 'habits')!;
    expect(habitPush.payload[0].goal_contribution).toBe('amount');
    expect(habitPush.payload[0].goal_factor).toBe(0.25);
  });

  it('pull: uzaktan gelen katkı biçimi ve çarpan yerele yazılır', async () => {
    const user = userRepo.getOrCreateLocal();
    remoteData['habits'] = [
      remoteHabit({
        id: 'uzak-1',
        updated_at: isoShift(0),
        kind: 'numeric',
        goal_contribution: 'amount',
        goal_factor: 0.25,
      }),
    ];

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    const habit = habitRepo.getById('uzak-1')!;
    expect(habit.goal_contribution).toBe('amount');
    expect(habit.goal_factor).toBe(0.25);
  });

  it('pull: çarpan uzaktan BOŞ gelirse varsayılana düşer, senkronu kilitlemez', async () => {
    // goal_factor yerelde NOT NULL — ham null yazmak pull'u fırlatır ve o
    // kullanıcının senkronu her turda aynı satırda patlayarak KALICI kilitlenirdi
    // (bkz. TableCfg.defaults).
    const user = userRepo.getOrCreateLocal();
    remoteData['habits'] = [
      remoteHabit({ id: 'uzak-1', updated_at: isoShift(0), goal_factor: null, kind: null }),
    ];

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    const habit = habitRepo.getById('uzak-1')!;
    expect(habit.goal_factor).toBe(1);
    expect(habit.kind).toBe('binary');
  });
});

// P1: hedef ilerlemesi çok cihazda SESSİZCE kayboluyordu. current_value sıradan
// bir kolondu ve son-yazan-kazanır ile taşınıyordu; goal_entries ise ekleme-yalnız
// ve satır satır senkronlanıyordu. A'da +5, B'de +3 girilince iki GİRDİ de her
// cihaza ulaşıyor ama current_value yalnız son senkronlayanın değerini alıyordu —
// kullanıcı aynı ekranda "5 / 100" ile "+5, +3" geçmişini yan yana görüyordu.
// Çözüm: current_value = value_baseline + girdiler toplamı, pull'dan sonra
// yeniden hesaplanır (bkz. migration019 + goalRepo.recomputeAllFromEntries).
describe('runSync — hedef ilerlemesi çok cihazda birleşir', () => {
  // Uzak hedef satırı: DİĞER cihazın gördüğü (bu cihazın katkısını içermeyen)
  // eski önbellek değeriyle.
  function remoteGoal(over: Row & { id: string; updated_at: string }): Row {
    return {
      user_id: UID,
      title: 'Koş',
      goal_type: 'numeric',
      target_value: 100,
      current_value: 0,
      value_baseline: 0,
      unit: 'km',
      deadline: null,
      completed_at: null,
      remind_at: null,
      start_date: null,
      deleted_at: null,
      ...over,
    };
  }

  it('İKİ CİHAZIN KATKISI TOPLANIR: uzak current_value yerel katkıyı EZMEZ', async () => {
    const user = userRepo.getOrCreateLocal();
    const goal = goalRepo.create({ user_id: user.id, title: 'Koş', goal_type: 'numeric', target_value: 100 });
    goalRepo.addProgress(goal.id, 5); // bu cihaz: +5 km

    // Diğer cihaz +3 km girmiş: kendi girdisini ve KENDİ gördüğü current_value'yu
    // (3 — bizim 5'imizden habersiz) buluta yazmış. Hedef satırı yerelden yeni.
    remoteData['goals'] = [
      remoteGoal({ id: goal.id, updated_at: isoShift(60_000), current_value: 3 }),
    ];
    remoteData['goal_entries'] = [
      { id: 'uzak-girdi', goal_id: goal.id, amount: 3, updated_at: isoShift(60_000), deleted_at: null },
    ];

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    // Eskiden 3 çıkıyordu (uzak önbellek yerel katkıyı eziyordu). Artık 5 + 3.
    expect(goalRepo.getById(goal.id)!.current_value).toBe(8);
    // Geçmiş ve değer artık birbirini doğruluyor.
    const sum = goalEntryRepo.listByGoal(goal.id).reduce((s, e) => s + e.amount, 0);
    expect(sum).toBe(8);
  });

  it('elle yapılan düzeltme (baseline) girdilerin ÜSTÜNE biner', async () => {
    const user = userRepo.getOrCreateLocal();
    const goal = goalRepo.create({ user_id: user.id, title: 'Koş', goal_type: 'numeric', target_value: 100 });
    goalRepo.addProgress(goal.id, 5);
    goalRepo.update(goal.id, { current_value: 50 }); // baseline 45

    remoteData['goal_entries'] = [
      { id: 'uzak-girdi', goal_id: goal.id, amount: 3, updated_at: isoShift(60_000), deleted_at: null },
    ];

    await runSync(user.id);

    // 45 (elle) + 5 (yerel girdi) + 3 (uzak girdi)
    expect(goalRepo.getById(goal.id)!.current_value).toBe(53);
  });

  it('uzaktan gelen baseline uygulanır (elle düzeltme son-yazan-kazanır kalır)', async () => {
    const user = userRepo.getOrCreateLocal();
    const goal = goalRepo.create({ user_id: user.id, title: 'Koş', goal_type: 'numeric', target_value: 100 });
    goalRepo.addProgress(goal.id, 5);

    // Diğer cihazda kullanıcı "Mevcut değer"i elle 30'a çekmiş → baseline 30.
    remoteData['goals'] = [
      remoteGoal({ id: goal.id, updated_at: isoShift(60_000), value_baseline: 30, current_value: 30 }),
    ];

    await runSync(user.id);

    expect(goalRepo.getById(goal.id)!.current_value).toBe(35); // 30 + 5 (yerel girdi)
  });

  it('yeniden hesap sonsuz push gel-gitine yol açmaz (synced bozulmaz)', async () => {
    const user = userRepo.getOrCreateLocal();
    const goal = goalRepo.create({ user_id: user.id, title: 'Koş', goal_type: 'numeric', target_value: 100 });
    goalRepo.addProgress(goal.id, 5);

    await runSync(user.id); // ilk turda push edilir
    upserts = [];
    const second = await runSync(user.id);

    expect(second.status).toBe('ok');
    expect(second.pushed).toBe(0); // ikinci turda gönderilecek bir şey kalmamalı
    expect(goalRepo.getById(goal.id)!.current_value).toBe(5);
  });
});

describe('prepareFullResync', () => {
  it('tüm satırları yeniden bekletir ve filigranı sıfırlar', async () => {
    const user = userRepo.getOrCreateLocal();
    habitRepo.create({ user_id: user.id, title: 'Su iç' });
    remoteData['habits'] = [remoteHabit({ id: 'uzak-1', updated_at: isoShift(0) })];

    await runSync(user.id);
    expect(await AsyncStorage.getItem(wmKey('habits'))).not.toBeNull();
    expect(syncedFlags('habits')).toEqual([1, 1]);

    await prepareFullResync();

    expect(await AsyncStorage.getItem(wmKey('habits'))).toBeNull();
    expect(syncedFlags('habits')).toEqual([0, 0]);
  });
});

describe('clearLocalData', () => {
  it('tüm kullanıcı verisi tablolarını siler, users\'ı korur, filigranı sıfırlar', async () => {
    const user = userRepo.getOrCreateLocal();
    // Her tabloda (FK zinciriyle) veri üret.
    const goal = goalRepo.create({ user_id: user.id, title: 'H', goal_type: 'numeric', target_value: 10 });
    const habit = habitRepo.create({ user_id: user.id, title: 'Su iç', goal_id: goal.id });
    habitRepo.toggleLog(habit.id, '2026-07-01', true);
    const task = taskRepo.create({ user_id: user.id, title: 'Görev' });
    subtaskRepo.create(task.id, 'Alt');
    await AsyncStorage.setItem(wmKey('habits'), '2026-07-01T00:00:00.000Z');

    const count = (t: string) =>
      getDb().getFirstSync<{ n: number }>(`SELECT COUNT(*) n FROM ${t}`)!.n;
    for (const t of ['goals', 'habits', 'habit_logs', 'tasks', 'subtasks']) {
      expect(count(t)).toBeGreaterThan(0);
    }

    await clearLocalData();

    for (const t of ['goals', 'habits', 'habit_logs', 'tasks', 'subtasks']) {
      expect(count(t)).toBe(0);
    }
    // Yerel kimlik (users) korunur; filigran sıfırlanır.
    expect(count('users')).toBe(1);
    expect(await AsyncStorage.getItem(wmKey('habits'))).toBeNull();
  });

  it('boş veritabanında hata vermez', async () => {
    userRepo.getOrCreateLocal();
    await expect(clearLocalData()).resolves.toBeUndefined();
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

describe('hesap değişimi — sahiplik takibi', () => {
  const OWNER_KEY = 'sync:ownerUid';

  it('başarılı senkron sonrası sahip uid yazılır', async () => {
    const user = userRepo.getOrCreateLocal();
    habitRepo.create({ user_id: user.id, title: 'Su iç' });

    await runSync(user.id);

    expect(await AsyncStorage.getItem(OWNER_KEY)).toBe(UID);
  });

  it('senkron BAŞARISIZSA sahip yazılmaz (yanlış sahiplik iddiası olmaz)', async () => {
    const user = userRepo.getOrCreateLocal();
    habitRepo.create({ user_id: user.id, title: 'Su iç' });
    upsertErrorTable = 'habits';

    await runSync(user.id);

    expect(await AsyncStorage.getItem(OWNER_KEY)).toBeNull();
  });

  it('sahip yokken giriş "fresh" sayılır (anonim kullanımdan hesaba geçiş)', async () => {
    expect(await classifySignIn(UID)).toBe('fresh');
  });

  it('aynı hesaba yeniden giriş "same" sayılır', async () => {
    await setSyncOwner(UID);
    expect(await classifySignIn(UID)).toBe('same');
  });

  it('BAŞKA hesaba giriş "switch" sayılır', async () => {
    await setSyncOwner('eski-uid');
    expect(await classifySignIn(UID)).toBe('switch');
  });
});

describe('hesap değişimi — RLS çakışması tanınması', () => {
  it('Postgres RLS reddi sahiplik çakışması olarak işaretlenir', async () => {
    const user = userRepo.getOrCreateLocal();
    habitRepo.create({ user_id: user.id, title: 'Su iç' });
    upsertErrorTable = 'habits';
    upsertErrorMessage =
      'new row violates row-level security policy (USING expression) for table "habits"';

    const result = await runSync(user.id);

    expect(result.status).toBe('error');
    expect(result.ownershipConflict).toBe(true);
  });

  it('sıradan hata sahiplik çakışması SAYILMAZ', async () => {
    const user = userRepo.getOrCreateLocal();
    habitRepo.create({ user_id: user.id, title: 'Su iç' });
    upsertErrorTable = 'habits';

    const result = await runSync(user.id);

    expect(result.status).toBe('error');
    expect(result.ownershipConflict).toBe(false);
  });

  it('isOwnershipConflict yalnız RLS mesajlarını tanır', () => {
    expect(isOwnershipConflict('new row violates row-level security policy')).toBe(true);
    expect(isOwnershipConflict('network request failed')).toBe(false);
  });
});

describe('hesap değişimi — iki çözüm yolu', () => {
  it('BİRLEŞTİR: id\'ler yenilenir, veri korunur, her şey yeniden gönderilmeyi bekler', async () => {
    const user = userRepo.getOrCreateLocal();
    const habit = habitRepo.create({ user_id: user.id, title: 'Su iç' });
    habitRepo.toggleLog(habit.id, '2026-07-01', true);
    await runSync(user.id); // synced=1 + sahip yazılır

    await prepareMergeIntoAccount();

    // Veri duruyor ama kimlikler değişti -> push artık EKLEME olur, çakışmaz.
    expect(habitRepo.getById(habit.id)).toBeNull();
    const rows = getDb().getAllSync<any>(`SELECT id, title FROM habits`);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Su iç');
    expect(rows[0].id).not.toBe(habit.id);
    expect(syncedFlags('habits')).toEqual([0]);
    expect(syncedFlags('habit_logs')).toEqual([0]);
  });

  it('DEĞİŞTİR: yerel veri silinir, filigran sıfırlanır (bulut baştan indirilir)', async () => {
    const user = userRepo.getOrCreateLocal();
    const habit = habitRepo.create({ user_id: user.id, title: 'Su iç' });
    habitRepo.toggleLog(habit.id, '2026-07-01', true);
    await runSync(user.id);

    await prepareReplaceWithAccount();

    expect(getDb().getFirstSync<{ n: number }>(`SELECT COUNT(*) n FROM habits`)!.n).toBe(0);
    expect(getDb().getFirstSync<{ n: number }>(`SELECT COUNT(*) n FROM habit_logs`)!.n).toBe(0);
    expect(await AsyncStorage.getItem(wmKey('habits'))).toBeNull();
    // Cihaz kimliği korunur.
    expect(getDb().getFirstSync<{ n: number }>(`SELECT COUNT(*) n FROM users`)!.n).toBe(1);
  });

  it('BİRLEŞTİR zamanlayıcı durumunu temizler (eski id\'ye bağlı kalmasın)', async () => {
    const user = userRepo.getOrCreateLocal();
    const habit = habitRepo.create({ user_id: user.id, title: 'Koş' });
    await AsyncStorage.setItem('timer:active', JSON.stringify({ habitId: habit.id }));

    await prepareMergeIntoAccount();

    expect(await AsyncStorage.getItem('timer:active')).toBeNull();
  });
});
