// SCHEMA ↔ SYNC COLUMN PARITY.
//
// WHY THIS EXISTS: syncEngine.TABLES is a hand-maintained list, and its link
// to the local schema isn't checked by the compiler. Forgetting to update this
// list when a migration adds a new column produces a SILENT failure — the
// column is never sent on push, never written on pull, and the record keeps
// looking correct on one device while falling back to the default on a
// second one. No type check, no runtime error, no warning ever reaches the user.
//
// This exact thing happened: goal_contribution and goal_factor (migration010)
// were never added to the sync list; a goal contribution with a unit
// multiplier ("4 cups = 1 liter") fell back to per_completion on the second
// device and wrote the wrong progress to the linked goal. These tests would
// have caught that bug, and catch every recurrence of it from now on.
//
// RULE: the synced column set = ALL columns of the local table − LOCAL_ONLY.
// If a new column is meant to stay local on purpose, it must be added below
// EXPLICITLY, so "forgotten" and "deliberately excluded" stay visibly distinct in the code.

import { getDb } from '../../db/database';
import { resetTestDb } from '../../test/dbTestUtils';

// syncEngine pulls in the supabase client (and thus react-native). This test
// doesn't need that — it only reads the TABLES definition (same mocking
// pattern as syncEngine.test.ts; the mocks must come BEFORE the import).
jest.mock('../supabase', () => ({ supabase: null }));
jest.mock('../auth', () => ({ ensureSignedIn: async () => null }));

// eslint-disable-next-line import/first
import { TABLES } from '../syncEngine';

// Local columns that aren't synced (deliberately).
//   synced — the "waiting to be pushed to the cloud" flag; it's device-specific
//            and has, and must have, no remote counterpart.
const LOCAL_ONLY_COLUMNS = new Set(['synced']);

// Local tables that aren't synced (deliberately).
//   users — the device identity; the cloud identity is auth.users, this table
//           only holds the local user record (anonymous/account) (see userRepo).
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
      // Order doesn't matter (the SELECT/INSERT list uses its own order), the set does.
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
    // upsertLocal writes an empty incoming value via `?? defaults ?? null`. If a
    // NOT NULL column has no default, a single missing field makes the pull
    // throw and that user's sync gets PERMANENTLY stuck (failing on the same row every round).
    // All tables are reported in ONE go: asserting table by table would stop
    // at the first failure and leave the rest of the gaps for the next run.
    const missing: Record<string, string[]> = {};
    for (const cfg of TABLES) {
      const cols = getDb()
        .getAllSync<{ name: string; notnull: number; dflt_value: string | null }>(
          `PRAGMA table_info(${cfg.table});`
        )
        // Only the NOT NULL columns where the local schema ITSELF declares a
        // default: this is the set where a fallback is both needed and
        // uncontroversial. NOT NULL columns with no default (like
        // goal_entries.amount) are the record's payload and have no sensible
        // value to invent — they're NOT NULL in the remote schema too.
        .filter((c) => c.notnull === 1 && c.dflt_value != null)
        .filter((c) => cfg.cols.includes(c.name))
        .filter((c) => cfg.defaults?.[c.name] === undefined)
        .map((c) => c.name);
      if (cols.length > 0) missing[cfg.table] = cols;
    }
    expect(missing).toEqual({});
  });
});
