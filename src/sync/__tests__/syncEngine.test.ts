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

import {
  classifySignIn,
  clearLocalData,
  isOwnershipConflict,
  prepareFullResync,
  prepareMergeIntoAccount,
  prepareReplaceWithAccount,
  runSync,
  setSyncOwner,
  pendingChangeCount,
  forgetAccountOnDevice,
  resolveAccountSwitch,
} from '../syncEngine';

// Must match syncEngine's WATERMARK_SAFETY_MS.
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
// Push goes out in batches: null = every upsert fails, a number = only that
// Nth request (1-based) fails.
let upsertErrorAtCall: number | null;
let gtCalls: Array<{ table: string; since: string }>;
let rangeCalls: Array<{ table: string; from: number; to: number }>;
let reconcileCalls: Array<{ table: string; ids: string[] }>;

// The trigger-written server timestamp; fixtures without one use updated_at.
const serverTs = (r: Row): string => String(r.server_updated_at ?? r.updated_at);

// Mimics the PostgREST chains the engine uses: .upsert(rows) and
// .select().gt().order().order().range() (filtered/sorted on the gt() column).
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
      // Filters used by the shared-task reconciliation query (.in/.eq/.is, awaited directly).
      let inIds: string[] | null = null;
      const eqs: Array<[string, unknown]> = [];
      const nulls: string[] = [];
      const q = {
        in: (_col: string, ids: string[]) => {
          inIds = ids;
          reconcileCalls.push({ table, ids });
          return q;
        },
        eq: (col: string, value: unknown) => {
          eqs.push([col, value]);
          return q;
        },
        is: (col: string, _value: null) => {
          nulls.push(col);
          return q;
        },
        then: (resolve: (v: unknown) => void) => {
          const rows = (remoteData[table] ?? []).filter(
            (r) =>
              (inIds == null || inIds.includes(String(r.id))) &&
              eqs.every(([c, v]) => r[c] === v) &&
              nulls.every((c) => r[c] == null)
          );
          resolve({ data: rows.map((r) => ({ id: r.id })), error: null });
        },
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
  reconcileCalls = [];
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

// A full resync can leave thousands of rows pending; one all-or-nothing
// request that times out would never make progress.
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

    // The first batch stays done; a retry doesn't start from scratch.
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
    // Not exactly the max: a transaction that started earlier but committed
    // later carries a smaller timestamp and would be skipped forever.
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
    // Two transactions: the one started LATE commits first (larger timestamp),
    // the early one commits later. The first round only sees the late one.
    const user = userRepo.getOrCreateLocal();
    const late = isoShift(0);
    const early = new Date(new Date(late).getTime() - 2000).toISOString(); // within the safety margin
    remoteData['habits'] = [remoteHabit({ id: 'gec-commit', updated_at: late })];

    await runSync(user.id);
    expect(habitRepo.getById('gec-commit')).not.toBeNull();

    // The delayed transaction has now committed: its timestamp is SMALLER.
    remoteData['habits'].push(remoteHabit({ id: 'erken-baslayan', updated_at: early }));
    await runSync(user.id);

    // Without the margin it would never satisfy `> since`.
    expect(habitRepo.getById('erken-baslayan')).not.toBeNull();
  });

  it('filigran TABLO BAŞINA tutulur: bir tablonun yeni satırı diğerinin eski satırını atlatmaz', async () => {
    // With one global watermark, tasks advancing to 10:09 hid goals' 10:05 row forever.
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

  it('aynı anda ikinci senkron reddedilir (inFlight kilidi)', async () => {
    const user = userRepo.getOrCreateLocal();
    const first = runSync(user.id);
    const second = await runSync(user.id);
    // 'busy', not 'error' (see SyncResult).
    expect(second.status).toBe('busy');
    expect(second.message).toContain('zaten sürüyor');
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

    // Watermark = newest row minus the safety margin: nothing lost to paging.
    const lastUpdated = new Date(base + 1000 * 1000).toISOString();
    const stored = (await AsyncStorage.getItem(wmKey('habit_logs')))!;
    expect(new Date(stored).getTime()).toBe(new Date(lastUpdated).getTime() - WATERMARK_SAFETY_MS);
  });
});

describe('runSync — reminders doğal anahtar birleştirme', () => {
  // Old dashless local ids come back dashed from Postgres' uuid column; the
  // natural key (entity_type, entity_id, time) keeps that from doubling a reminder.
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

  // Another device saved the form: 08:30 deleted as id-1 and recreated as id-2
  // in the same millisecond. id-1's tombstone is already here; the live id-2
  // with the SAME timestamp must not lose the tie to it.
  it('silinmiş (tombstone) yerel rakip, aynı damgalı canlı uzak satırı ezmez', async () => {
    const user = userRepo.getOrCreateLocal();
    const habit = habitRepo.create({ user_id: user.id, title: 'Su iç' });
    const old = reminderRepo.create('habit', habit.id, '08:30');
    const stamp = isoShift(3600_000);
    getDb().runSync(`UPDATE reminders SET deleted_at = ?, updated_at = ?, synced = 1 WHERE id = ?`, [
      stamp,
      stamp,
      old.id,
    ]);

    remoteData['reminders'] = [{
      id: 'aaaaaaaa-0000-0000-0000-000000000002',
      entity_type: 'habit',
      entity_id: habit.id,
      time: '08:30',
      updated_at: stamp, // exactly the tombstone's timestamp
      deleted_at: null,
    }];

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    const rows = reminderRepo.listByEntity('habit', habit.id);
    expect(rows.map((r) => r.id)).toEqual(['aaaaaaaa-0000-0000-0000-000000000002']);
  });

  it('uzak tombstone, farklı id\'li CANLI yerel hatırlatmayı silmez (yalnız kendi id\'siyle saklanır)', async () => {
    const user = userRepo.getOrCreateLocal();
    const habit = habitRepo.create({ user_id: user.id, title: 'Su iç' });
    const live = reminderRepo.create('habit', habit.id, '08:30');

    remoteData['reminders'] = [{
      id: 'aaaaaaaa-0000-0000-0000-000000000009',
      entity_type: 'habit',
      entity_id: habit.id,
      time: '08:30',
      updated_at: isoShift(3600_000), // newer, but it's a deletion of a DIFFERENT id
      deleted_at: isoShift(3600_000),
    }];

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    expect(reminderRepo.listByEntity('habit', habit.id).map((r) => r.id)).toEqual([live.id]);
  });
});

describe('runSync — habit_logs doğal anahtar birleştirme', () => {
  // Two devices logged the same habit and day under different ids: merge by
  // last-writer-wins instead of a UNIQUE(habit_id, log_date) violation.
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

// goal_contribution/goal_factor must round-trip ("4 cups = 1 liter" on a second
// device). syncColumnParity.test.ts guards the column list; these the behavior.
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
    // goal_factor is NOT NULL locally: a raw null would fail every pull (TableCfg.defaults).
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

// +5 on device A and +3 on B must total 8 everywhere: current_value is
// value_baseline + the entries, recomputed after every pull — never the
// last-written cached value.
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
    // 5 + 3, not the remote cache's 3.
    expect(goalRepo.getById(goal.id)!.current_value).toBe(8);
    // History and the value now confirm each other.
    const sum = goalEntryRepo.listByGoal(goal.id).reduce((s, e) => s + e.amount, 0);
    expect(sum).toBe(8);
  });

  // Shared goal (phase 4): a friend's contribution is written server-side as an
  // ordinary goal_entries row on MY goal, stamped with their uid. It must land
  // through the normal pull, keep who added it, and count toward the total.
  it('arkadaşın ortak hedefe eklediği girdi pull ile gelir, added_by korunur ve toplama katılır', async () => {
    const user = userRepo.getOrCreateLocal();
    const goal = goalRepo.create({ user_id: user.id, title: 'Koş', goal_type: 'numeric', target_value: 100 });
    goalRepo.addProgress(goal.id, 10);
    const FRIEND = '00000000-0000-0000-0000-00000000000b';

    remoteData['goal_entries'] = [
      { id: 'arkadas-girdi', goal_id: goal.id, amount: 4, updated_at: isoShift(60_000), deleted_at: null, added_by: FRIEND },
    ];

    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    expect(goalRepo.getById(goal.id)!.current_value).toBe(14);
    const byFriend = goalEntryRepo.listByGoal(goal.id).find((e) => e.id === 'arkadas-girdi');
    expect(byFriend?.added_by).toBe(FRIEND);
    // My own entries stay unattributed (NULL = the owner) and push that way.
    const mine = upserts.find((u) => u.table === 'goal_entries')!.payload[0];
    expect(mine.added_by).toBeNull();
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

// SHARED TASKS (friends/sharing phase 3). The owner's row reaches the friend
// through the normal pull (RLS widens SELECT). The invariant that matters most:
// the friend's copy must NEVER be pushed — RLS would reject it and wedge sync.
describe('paylaşılan görevler', () => {
  const FRIEND = 'friend-uid';

  function remoteTask(overrides: Row & { id: string }): Row {
    return {
      user_id: FRIEND,
      title: 'Ortak görev',
      due_date: '2026-07-01',
      end_time: null,
      priority: 'medium',
      recurrence: null,
      remind_at: null,
      completed_at: null,
      updated_at: '2026-07-01T10:00:00.000Z',
      deleted_at: null,
      shared_with_id: UID,
      ...overrides,
    };
  }

  const sharedRows = () =>
    getDb().getAllSync<{ id: string; shared_owner_uid: string | null; user_id: string }>(
      `SELECT id, shared_owner_uid, user_id FROM tasks WHERE shared_owner_uid IS NOT NULL`
    );

  it('başkasının görevi pull ile gelir, sahibi işaretlenir ve kendi listemde görünür', async () => {
    const user = userRepo.getOrCreateLocal();
    remoteData['tasks'] = [remoteTask({ id: 't-shared' })];

    await runSync(user.id);

    expect(sharedRows()).toEqual([{ id: 't-shared', shared_owner_uid: FRIEND, user_id: user.id }]);
    expect(taskRepo.listByUser(user.id).map((t) => t.id)).toContain('t-shared');
  });

  it('kendi görevim pull ile gelince sahibi boş kalır', async () => {
    const user = userRepo.getOrCreateLocal();
    remoteData['tasks'] = [remoteTask({ id: 't-own', user_id: UID, shared_with_id: FRIEND })];

    await runSync(user.id);

    expect(taskRepo.getById('t-own')).toMatchObject({ shared_owner_uid: null, shared_with_id: FRIEND });
  });

  it('prepareFullResync her şeyi synced=0 yapsa bile başkasının görevi push edilmez', async () => {
    const user = userRepo.getOrCreateLocal();
    const own = taskRepo.create({ user_id: user.id, title: 'Benim' });
    remoteData['tasks'] = [remoteTask({ id: 't-shared' })];
    await runSync(user.id);
    upserts = [];

    await prepareFullResync();
    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    const pushedIds = upserts.filter((u) => u.table === 'tasks').flatMap((u) => u.payload.map((p) => p.id));
    expect(pushedIds).toContain(own.id);
    expect(pushedIds).not.toContain('t-shared');
  });

  it('paylaşım bitince (satır artık görünmüyor) yerel kopya silinir', async () => {
    const user = userRepo.getOrCreateLocal();
    remoteData['tasks'] = [remoteTask({ id: 't-shared' })];
    await runSync(user.id);

    remoteData['tasks'] = [remoteTask({ id: 't-shared', shared_with_id: null })];
    await runSync(user.id);

    expect(sharedRows()).toEqual([]);
  });

  it('paylaşılan görev yokken uzlaştırma sorgusu hiç atılmaz', async () => {
    const user = userRepo.getOrCreateLocal();
    taskRepo.create({ user_id: user.id, title: 'Benim' });

    await runSync(user.id);

    expect(reconcileCalls).toEqual([]);
  });

  it('başkasının görevinde yerel düzenleme yok sayılır (kuyruğa girmez)', async () => {
    const user = userRepo.getOrCreateLocal();
    remoteData['tasks'] = [remoteTask({ id: 't-shared' })];
    await runSync(user.id);

    taskRepo.setCompleted('t-shared', true);
    taskRepo.update('t-shared', { title: 'Değiştirdim' });
    taskRepo.softDelete('t-shared');

    expect(taskRepo.getById('t-shared')).toMatchObject({
      title: 'Ortak görev',
      completed_at: null,
      deleted_at: null,
      synced: 1,
    });
  });

  it('hesap birleştirmede başkasının görevi yeni hesaba kopyalanmaz', async () => {
    const user = userRepo.getOrCreateLocal();
    remoteData['tasks'] = [remoteTask({ id: 't-shared' })];
    await runSync(user.id);

    await prepareMergeIntoAccount();

    expect(sharedRows()).toEqual([]);
  });

  it('arkadaşın işaretlemesi (RPC sonucu) yerel satıra push kuyruğuna girmeden yazılır', async () => {
    const user = userRepo.getOrCreateLocal();
    remoteData['tasks'] = [remoteTask({ id: 't-shared' })];
    await runSync(user.id);

    taskRepo.applySharedCompletion('t-shared', '2026-07-01T12:00:00.000Z', '2026-07-01T12:00:00.000Z');

    expect(taskRepo.getById('t-shared')).toMatchObject({
      completed_at: '2026-07-01T12:00:00.000Z',
      synced: 1,
    });
  });
});

describe('paylaşılan görevin alt görevleri', () => {
  const FRIEND = 'friend-uid';

  const remoteTask = (): Row => ({
    id: 't-shared',
    user_id: FRIEND,
    title: 'Market',
    due_date: '2026-07-01',
    end_time: null,
    priority: 'medium',
    recurrence: null,
    remind_at: null,
    completed_at: null,
    updated_at: '2026-07-01T10:00:00.000Z',
    deleted_at: null,
    shared_with_id: UID,
  });
  const remoteSub = (id: string, extra: Row = {}): Row => ({
    id,
    task_id: 't-shared',
    title: 'Süt',
    completed: 0,
    position: 0,
    updated_at: '2026-07-01T10:00:00.000Z',
    deleted_at: null,
    ...extra,
  });

  it('arkadaşın görevinin alt görevleri pull ile gelir ve rozet sayısına yansır', async () => {
    const user = userRepo.getOrCreateLocal();
    remoteData['tasks'] = [remoteTask()];
    remoteData['subtasks'] = [remoteSub('s1'), remoteSub('s2', { title: 'Ekmek', position: 1, completed: 1 })];

    await runSync(user.id);

    expect(subtaskRepo.listByTask('t-shared').map((s) => s.title)).toEqual(['Süt', 'Ekmek']);
    expect(subtaskRepo.countsForTasks(['t-shared'])).toEqual({ 't-shared': { done: 1, total: 2 } });
  });

  it('prepareFullResync her şeyi synced=0 yapsa bile başkasının alt görevi push edilmez', async () => {
    const user = userRepo.getOrCreateLocal();
    const own = taskRepo.create({ user_id: user.id, title: 'Benim' });
    const ownSub = subtaskRepo.create(own.id, 'Kendi alt görevim');
    remoteData['tasks'] = [remoteTask()];
    remoteData['subtasks'] = [remoteSub('s1')];
    await runSync(user.id);
    upserts = [];

    await prepareFullResync();
    const result = await runSync(user.id);

    expect(result.status).toBe('ok');
    const pushed = upserts.filter((u) => u.table === 'subtasks').flatMap((u) => u.payload.map((p) => p.id));
    expect(pushed).toContain(ownSub.id);
    expect(pushed).not.toContain('s1');
  });

  it('başkasının alt görevi bekleyen değişiklik sayılmaz (çıkış uyarısı yanlış çalmaz)', async () => {
    const user = userRepo.getOrCreateLocal();
    remoteData['tasks'] = [remoteTask()];
    remoteData['subtasks'] = [remoteSub('s1')];
    await runSync(user.id);
    await prepareFullResync(); // her satır synced=0

    expect(pendingChangeCount()).toBe(0);
  });

  it('paylaşım bitince görevle birlikte alt görevleri de silinir', async () => {
    const user = userRepo.getOrCreateLocal();
    remoteData['tasks'] = [remoteTask()];
    remoteData['subtasks'] = [remoteSub('s1')];
    await runSync(user.id);

    remoteData['tasks'] = [{ ...remoteTask(), shared_with_id: null }];
    await runSync(user.id);

    expect(subtaskRepo.listByTask('t-shared')).toEqual([]);
    expect(getDb().getAllSync(`SELECT id FROM subtasks WHERE task_id = 't-shared'`)).toEqual([]);
  });

  it('arkadaşın yerelde işareti ve silmesi yok sayılır; RPC sonucu kuyruğa girmeden yazılır', async () => {
    const user = userRepo.getOrCreateLocal();
    remoteData['tasks'] = [remoteTask()];
    remoteData['subtasks'] = [remoteSub('s1')];
    await runSync(user.id);

    subtaskRepo.setCompleted('s1', true);
    subtaskRepo.softDelete('s1');
    subtaskRepo.create('t-shared', 'Sızdırılmış');
    expect(subtaskRepo.listByTask('t-shared')).toHaveLength(1);
    expect(subtaskRepo.listByTask('t-shared')[0]).toMatchObject({ completed: 0, deleted_at: null, synced: 1 });

    subtaskRepo.applySharedCompletion('s1', true, '2026-07-01T12:00:00.000Z');
    expect(subtaskRepo.listByTask('t-shared')[0]).toMatchObject({
      completed: 1,
      updated_at: '2026-07-01T12:00:00.000Z',
      synced: 1,
    });
  });

  it('applySharedCompletion kendi alt görevime dokunmaz', async () => {
    const user = userRepo.getOrCreateLocal();
    const own = taskRepo.create({ user_id: user.id, title: 'Benim' });
    const sub = subtaskRepo.create(own.id, 'Kendi');

    subtaskRepo.applySharedCompletion(sub.id, true, '2026-07-01T12:00:00.000Z');

    expect(subtaskRepo.listByTask(own.id)[0]).toMatchObject({ completed: 0, synced: 0 });
  });
});

// Data belongs to the account: sign-out forgets it on the device; only
// pendingChangeCount() (a real data-loss warning) may hold it up.
describe('çıkış — veri hesaba ait', () => {
  const OWNER_KEY = 'sync:ownerUid';

  it('pendingChangeCount yalnız buluta gitmemiş satırları sayar (başkasının paylaştığı görev hariç)', async () => {
    const user = userRepo.getOrCreateLocal();
    expect(pendingChangeCount()).toBe(0);

    const habit = habitRepo.create({ user_id: user.id, title: 'Su iç' });
    habitRepo.toggleLog(habit.id, '2026-09-01', true);
    expect(pendingChangeCount()).toBe(2); // habit + its log

    await runSync(user.id); // both pushed
    expect(pendingChangeCount()).toBe(0);

    // A friend's task shared with me is never pushed, so it never counts as
    // "not backed up" (it would block sign-out forever otherwise).
    getDb().runSync(
      `INSERT INTO tasks (id, user_id, title, priority, updated_at, synced, shared_owner_uid)
       VALUES ('t-x', ?, 'Arkadaşın', 'medium', ?, 0, 'friend-uid')`,
      [user.id, new Date().toISOString()]
    );
    expect(pendingChangeCount()).toBe(0);
  });

  it('forgetAccountOnDevice cihazdaki veriyi ve sahiplik işaretini siler — sonraki giriş "fresh" olur', async () => {
    const user = userRepo.getOrCreateLocal();
    habitRepo.create({ user_id: user.id, title: 'Su iç' });
    await runSync(user.id);
    expect(await AsyncStorage.getItem(OWNER_KEY)).toBe(UID);

    await forgetAccountOnDevice();

    expect(habitRepo.listByUser(user.id)).toEqual([]);
    expect(await AsyncStorage.getItem(OWNER_KEY)).toBeNull();
    expect(await classifySignIn('baska-hesap')).toBe('fresh');
    expect(userRepo.getOrCreateLocal().id).toBe(user.id); // the device identity stays
  });

  it('resolveAccountSwitch: bekleyen değişiklik YOKSA cihazı yeni hesaba göre sıfırlar (replace)', async () => {
    const user = userRepo.getOrCreateLocal();
    habitRepo.create({ user_id: user.id, title: 'Eski hesabın alışkanlığı' });
    await runSync(user.id); // safely in the old account's cloud

    expect(await resolveAccountSwitch()).toBe('replace');
    expect(habitRepo.listByUser(user.id)).toEqual([]);
  });

  it('resolveAccountSwitch: bekleyen değişiklik VARSA hiçbir şeyi kaybetmez (merge)', async () => {
    const user = userRepo.getOrCreateLocal();
    const h = habitRepo.create({ user_id: user.id, title: 'Hiç yedeklenmemiş' });

    expect(await resolveAccountSwitch()).toBe('merge');
    const list = habitRepo.listByUser(user.id);
    expect(list.map((x) => x.title)).toEqual(['Hiç yedeklenmemiş']);
    expect(list[0].id).not.toBe(h.id); // copied under a fresh id (no RLS clash)
  });
});
