// syncEngine tests: push/pull flow, last-writer-wins, identity mapping,
// watermark, and pagination for 1000+ records.
//
// Supabase and auth are mocked; the SQLite side runs against the real schema (in-memory).

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

// Must be imported AFTER the jest.mock calls so the mocks take effect.
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
// Must match WATERMARK_SAFETY_MS in syncEngine: the watermark is set this far
// behind the largest server timestamp seen (so out-of-order commits aren't skipped).
const WATERMARK_SAFETY_MS = 5_000;
const wmKey = (table: string) => `sync:lastPulledAt:${table}`;
const EPOCH = '1970-01-01T00:00:00.000Z';
const UID = 'remote-uid';

type Row = Record<string, unknown>;

// Fake remote state + call logs. Reset in every test.
let remoteData: Record<string, Row[]>;
let upserts: Array<{ table: string; payload: Row[] }>;
let upsertErrorTable: string | null;
let upsertErrorMessage: string;
// Push now goes out in batches (see PUSH_PAGE_SIZE), so a table can get more
// than one upsert request. null = ALL of that table's requests fail (the old
// behavior); a number makes only that Nth request (1-based) fail.
let upsertErrorAtCall: number | null;
let gtCalls: Array<{ table: string; since: string }>;
let rangeCalls: Array<{ table: string; from: number; to: number }>;

// The timestamp the server writes via trigger (see supabase/schema.sql). When
// fixtures don't supply one, the server is assumed to have received the record at the same time as the client.
const serverTs = (r: Row): string => String(r.server_updated_at ?? r.updated_at);

// Mimics the real PostgREST chain:
//   .from(t).upsert(rows)  and  .from(t).select().gt().order().order().range()
// range() slices like Supabase does: the [from, to] window of the ordered result set.
// Filtering/sorting is done on the column passed to gt() (the engine uses server_updated_at).
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

// A remote habit row with all columns filled in (upsertLocal expects NOT NULL columns).
function remoteHabit(overrides: Row & { id: string; updated_at: string }): Row {
  return {
    user_id: UID,
    goal_id: null,
    title: 'Remote habit',
    kind: 'binary',
    remind_at: null,
    icon: null,
    color: null,
    schedule: null,
    target_amount: null,
    unit: null,
    start_date: null,
    end_date: null,
    // Linked-goal contribution settings — a real cloud row carries these
    // (goal_factor is NOT NULL DEFAULT 1 in the remote schema).
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
  upsertErrorMessage = 'upsert failed';
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
    expect(result.pushed).toBe(2); // 1 habit + 1 log (the users table isn't synced)

    // Only tables with pending rows, parent first.
    expect(upserts.map((u) => u.table)).toEqual(['habits', 'habit_logs']);
    // The local user_id was converted to the uid at the boundary.
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
    // The failed row stays pending and is retried on the next round.
    expect(syncedFlags('habits')).toEqual([0]);
  });
});

// A long-time user's pending row count can reach into the thousands
// (prepareFullResync marks EVERYTHING synced=0 on every entry). If a single
// giant request times out on a mobile network, all-or-nothing behavior would
// lock sync permanently — batched sending breaks that.
describe('runSync — push partileri (büyük birikim)', () => {
  // Writes a log for `count` separate days on a single habit (UNIQUE(habit_id, log_date)).
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
    // No row was skipped.
    expect(syncedFlags('habit_logs')).toHaveLength(600);
    expect(syncedFlags('habit_logs').every((f) => f === 1)).toBe(true);
  });

  it('ortadaki parti patlarsa ÖNCEKİ partiler işaretli kalır (ilerleme korunur)', async () => {
    const user = userRepo.getOrCreateLocal();
    seedLogs(user.id, 600);
    upsertErrorTable = 'habit_logs';
    upsertErrorAtCall = 2; // first batch succeeds, second fails

    const result = await runSync(user.id);

    expect(result.status).toBe('error');
    expect(result.message).toContain('habit_logs push');

    // CRITICAL: without batching this count would be 0 and every round would restart from scratch.
    const flags = syncedFlags('habit_logs');
    expect(flags.filter((f) => f === 1)).toHaveLength(250);
    expect(flags.filter((f) => f === 0)).toHaveLength(350);
  });

  it('yeniden denemede yalnızca KALAN satırlar gönderilir', async () => {
    const user = userRepo.getOrCreateLocal();
    seedLogs(user.id, 600);
    upsertErrorTable = 'habit_logs';
    upsertErrorAtCall = 2;
    await runSync(user.id); // 250 succeeded, 350 pending

    upsertErrorTable = null;
    upserts = [];
    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    // 350 remaining → 250 + 100; the first round's 250 are NOT resent.
    const logPushes = upserts.filter((u) => u.table === 'habit_logs');
    expect(logPushes.map((u) => u.payload.length)).toEqual([250, 100]);
    expect(syncedFlags('habit_logs').every((f) => f === 1)).toBe(true);
  });
});

describe('runSync — pull', () => {
  it("adds a new remote record locally, converting user_id to the local identity", async () => {
    const user = userRepo.getOrCreateLocal();
    remoteData['habits'] = [
      remoteHabit({ id: 'uzak-1', title: 'Buluttan gelen', updated_at: isoShift(0) }),
    ];

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    expect(result.pulled).toBe(1);

    const pulled = habitRepo.getById('uzak-1')!;
    expect(pulled.title).toBe('Buluttan gelen');
    expect(pulled.user_id).toBe(user.id); // the local identity, not the uid
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
    // If it were set to exactly the largest timestamp, a concurrent transaction
    // that started slightly BEFORE that timestamp but committed AFTER it would
    // be permanently skipped (server_updated_at = now(), and now() is the transaction's START).
    const stored = (await AsyncStorage.getItem(wmKey('habits')))!;
    expect(new Date(stored).getTime()).toBe(new Date(t1).getTime() - WATERMARK_SAFETY_MS);

    gtCalls = [];
    await runSync(user.id);
    // Only habits advances from its own watermark; tables with no rows seen stay at epoch.
    expect(gtCalls.find((c) => c.table === 'habits')!.since).toBe(stored);
    for (const call of gtCalls.filter((c) => c.table !== 'habits')) {
      expect(call.since).toBe(EPOCH);
    }
  });

  it('güvenlik payı sayesinde SIRASIZ commit edilen satır bir sonraki turda yakalanır', async () => {
    // Scenario: two concurrent transactions. The one that started LATE commits
    // FIRST (large timestamp); the one that started EARLY commits LATER (small
    // timestamp). The first round only sees the large-timestamp one.
    const user = userRepo.getOrCreateLocal();
    const late = isoShift(0);
    const early = new Date(new Date(late).getTime() - 2000).toISOString(); // within the safety margin
    remoteData['habits'] = [remoteHabit({ id: 'gec-commit', updated_at: late })];

    await runSync(user.id);
    expect(habitRepo.getById('gec-commit')).not.toBeNull();

    // The delayed transaction has now committed: its timestamp is SMALLER.
    remoteData['habits'].push(remoteHabit({ id: 'erken-baslayan', updated_at: early }));
    await runSync(user.id);

    // Without the safety margin, this row would never satisfy `> since` and
    // would be skipped forever (silent data loss).
    expect(habitRepo.getById('erken-baslayan')).not.toBeNull();
  });

  it('filigran TABLO BAŞINA tutulur: bir tablonun yeni satırı diğerinin eski satırını atlatmaz', async () => {
    // Old bug: a single global watermark was set to the max across all tables.
    // Once tasks advanced to 10:09, goals's row at 10:05 never got pulled again.
    const user = userRepo.getOrCreateLocal();
    const early = '2026-07-23T10:05:00.000Z';
    const late = '2026-07-23T10:09:00.000Z';

    remoteData['tasks'] = [{
      id: 'uzak-gorev', user_id: UID, title: 'Geç damgalı görev', due_date: null,
      end_time: null, priority: 'medium', recurrence: null, remind_at: null,
      completed_at: null, updated_at: late, deleted_at: null,
    }];

    await runSync(user.id); // tasks's watermark advances to late, goals stays at epoch

    // Now give goals a row that only appears NOW but has an OLDER timestamp.
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
    // The old value is not inherited: epoch so any rows that were skipped can recover.
    for (const call of gtCalls) expect(call.since).toBe(EPOCH);
  });

  it('aynı anda ikinci senkron reddedilir (inFlight kilidi)', async () => {
    const user = userRepo.getOrCreateLocal();
    const first = runSync(user.id);
    const second = await runSync(user.id);
    // 'busy', NOT 'error': a conflict here isn't a failure, it's a state the
    // caller should silently ignore (see SyncResult).
    expect(second.status).toBe('busy');
    expect(second.message).toContain('zaten sürüyor'); // "already running"
    expect((await first).status).toBe('ok');
  });
});

describe('runSync — sayfalama (1000+ kayıt)', () => {
  it('1001 uzak log iki sayfada eksiksiz çekilir', async () => {
    const user = userRepo.getOrCreateLocal();
    const habit = habitRepo.create({ user_id: user.id, title: 'Su iç' });

    // 1001 days: log_date unique (UNIQUE), updated_at increasing (page order).
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

    // Two pages were requested for habit_logs: [0,999] and [1000,1999].
    const logRanges = rangeCalls.filter((c) => c.table === 'habit_logs');
    expect(logRanges).toEqual([
      { table: 'habit_logs', from: 0, to: 999 },
      { table: 'habit_logs', from: 1000, to: 1999 },
    ]);

    const count = getDb().getFirstSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM habit_logs`
    );
    expect(count?.n).toBe(1001);

    // The watermark advanced to the last (newest) row — no loss from pagination.
    // (Behind by the safety margin; see WATERMARK_SAFETY_MS.)
    const lastUpdated = new Date(base + 1000 * 1000).toISOString();
    const stored = (await AsyncStorage.getItem(wmKey('habit_logs')))!;
    expect(new Date(stored).getTime()).toBe(new Date(lastUpdated).getTime() - WATERMARK_SAFETY_MS);
  });
});

describe('runSync — reminders doğal anahtar birleştirme', () => {
  // Local ids used to be generated as dashless 32 characters in migration016;
  // the Postgres uuid column returns them WITH DASHES. When the ids didn't
  // match, the same reminder got inserted a second time and the notification
  // fired twice. The natural key (entity_type, entity_id, time) merges this duplicate.
  it('id\'si farklı ama aynı varlık+saat uzak hatırlatma kopya satır yaratmaz', async () => {
    const user = userRepo.getOrCreateLocal();
    const habit = habitRepo.create({ user_id: user.id, title: 'Su iç' });
    reminderRepo.create('habit', habit.id, '08:30');

    remoteData['reminders'] = [{
      id: '11111111-2222-3333-4444-555555555555', // the canonical id of the same reminder
      entity_type: 'habit',
      entity_id: habit.id,
      time: '08:30',
      updated_at: isoShift(3600_000), // newer than the local one -> remote wins
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
  // Two devices can log the same habit on the same day under different ids.
  // The old behavior would permanently lock sync with a UNIQUE(habit_id,
  // log_date) violation in this case; now records must merge into one via last-writer-wins.
  it('farklı id\'li ama aynı gün+alışkanlık uzak log yeniyse yereldekinin yerine geçer', async () => {
    const user = userRepo.getOrCreateLocal();
    const habit = habitRepo.create({ user_id: user.id, title: 'Su iç' });
    habitRepo.toggleLog(habit.id, '2026-07-01', false); // local: completed=0

    remoteData['habit_logs'] = [{
      id: 'uzak-log-1',
      habit_id: habit.id,
      log_date: '2026-07-01',
      completed: 1,
      amount: 0,
      updated_at: isoShift(3600_000), // newer than the local one
    }];

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    expect(result.pulled).toBe(1);
    // A single record remains: the remote one won, the local rival was deleted.
    const rows = getDb().getAllSync<any>(`SELECT id, completed, synced FROM habit_logs`);
    expect(rows).toEqual([{ id: 'uzak-log-1', completed: 1, synced: 1 }]);
  });

  it('uzak log eskiyse yerel kalır ve UNIQUE ihlali oluşmaz', async () => {
    const user = userRepo.getOrCreateLocal();
    const habit = habitRepo.create({ user_id: user.id, title: 'Su iç' });
    habitRepo.toggleLog(habit.id, '2026-07-01', true); // local: completed=1 (now)
    const localId = getDb().getFirstSync<any>(`SELECT id FROM habit_logs`)!.id;

    remoteData['habit_logs'] = [{
      id: 'uzak-log-2',
      habit_id: habit.id,
      log_date: '2026-07-01',
      completed: 0,
      amount: 0,
      updated_at: isoShift(-3600_000), // older than the local one
    }];

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    expect(result.pulled).toBe(0);
    const rows = getDb().getAllSync<any>(`SELECT id, completed FROM habit_logs`);
    expect(rows).toEqual([{ id: localId, completed: 1 }]);
  });
});

// Linked-goal contribution settings (goal_contribution/goal_factor) were
// MISSING from the sync column list for a long time: "4 cups = 1 liter" worked
// correctly on the device that created the habit, but the row landed on a
// second device of the same account with the defaults (per_completion, factor
// 1) — every check on that device wrote +1 to the goal instead of 0.25.
// Structural protection lives in __tests__/syncColumnParity.test.ts; the ones
// here verify the BEHAVIOR (that it actually round-trips).
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
    // goal_factor is NOT NULL locally — writing a raw null would make the pull
    // throw, and that user's sync would PERMANENTLY lock up, failing on the
    // same row every round (see TableCfg.defaults).
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

// P1: goal progress was SILENTLY disappearing across devices. current_value
// was a plain column carried by last-writer-wins; goal_entries was
// append-only and synced row by row. When +5 was entered on A and +3 on B,
// both ENTRIES reached every device, but current_value only ever took whoever
// synced last — the user saw "5 / 100" alongside a "+5, +3" history on the
// same screen. Fix: current_value = value_baseline + the sum of entries,
// recomputed after every pull (see migration019 + goalRepo.recomputeAllFromEntries).
describe('runSync — hedef ilerlemesi çok cihazda birleşir', () => {
  // Remote goal row: with the stale cached value the OTHER device sees
  // (not including this device's contribution).
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
    goalRepo.addProgress(goal.id, 5); // this device: +5 km

    // The other device entered +3 km: it wrote its own entry and the
    // current_value IT sees (3 — unaware of our 5) to the cloud. The goal row is newer than the local one.
    remoteData['goals'] = [
      remoteGoal({ id: goal.id, updated_at: isoShift(60_000), current_value: 3 }),
    ];
    remoteData['goal_entries'] = [
      { id: 'uzak-girdi', goal_id: goal.id, amount: 3, updated_at: isoShift(60_000), deleted_at: null },
    ];

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    // It used to come out as 3 (the remote cache overwrote the local contribution). Now it's 5 + 3.
    expect(goalRepo.getById(goal.id)!.current_value).toBe(8);
    // History and the value now confirm each other.
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

    // 45 (manual) + 5 (local entry) + 3 (remote entry)
    expect(goalRepo.getById(goal.id)!.current_value).toBe(53);
  });

  it('uzaktan gelen baseline uygulanır (elle düzeltme son-yazan-kazanır kalır)', async () => {
    const user = userRepo.getOrCreateLocal();
    const goal = goalRepo.create({ user_id: user.id, title: 'Koş', goal_type: 'numeric', target_value: 100 });
    goalRepo.addProgress(goal.id, 5);

    // On the other device, the user manually set "Current value" to 30 → baseline 30.
    remoteData['goals'] = [
      remoteGoal({ id: goal.id, updated_at: isoShift(60_000), value_baseline: 30, current_value: 30 }),
    ];

    await runSync(user.id);

    expect(goalRepo.getById(goal.id)!.current_value).toBe(35); // 30 + 5 (local entry)
  });

  it('yeniden hesap sonsuz push gel-gitine yol açmaz (synced bozulmaz)', async () => {
    const user = userRepo.getOrCreateLocal();
    const goal = goalRepo.create({ user_id: user.id, title: 'Koş', goal_type: 'numeric', target_value: 100 });
    goalRepo.addProgress(goal.id, 5);

    await runSync(user.id); // pushed on the first round
    upserts = [];
    const second = await runSync(user.id);

    expect(second.status).toBe('ok');
    expect(second.pushed).toBe(0); // nothing should be left to send on the second round
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
    // Produce data in every table (through the FK chain).
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
    // The local identity (users) is preserved; the watermark is reset.
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

    // The data is still there but the identities changed -> the push is now an INSERT, no conflict.
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
    // The device identity is preserved.
    expect(getDb().getFirstSync<{ n: number }>(`SELECT COUNT(*) n FROM users`)!.n).toBe(1);
  });

  it("MERGE clears timer state (so it doesn't stay tied to the old id)", async () => {
    const user = userRepo.getOrCreateLocal();
    const habit = habitRepo.create({ user_id: user.id, title: 'Koş' });
    await AsyncStorage.setItem('timer:active', JSON.stringify({ habitId: habit.id }));

    await prepareMergeIntoAccount();

    expect(await AsyncStorage.getItem('timer:active')).toBeNull();
  });
});
