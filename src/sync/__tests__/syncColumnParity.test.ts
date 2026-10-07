// Schema ↔ sync column parity. syncEngine.TABLES is maintained by hand; a
// column missing from it is never pushed or pulled and silently diverges
// between devices (it happened with goal_contribution/goal_factor).
// RULE: synced columns = every local column − LOCAL_ONLY. A column kept local
// on purpose must be listed below, so "forgotten" and "excluded" stay distinct.

import { getDb } from '../../db/database';
import { resetTestDb } from '../../test/dbTestUtils';

// Only TABLES is read; keep the supabase client (and react-native) out.
jest.mock('../supabase', () => ({ supabase: null }));
jest.mock('../auth', () => ({ ensureSignedIn: async () => null }));

// eslint-disable-next-line import/first
import { TABLES } from '../syncEngine';

// Deliberately local columns:
//   synced           — the device's "waiting to be pushed" flag.
//   shared_owner_uid — tasks shared WITH me: the real owner, derived on pull
//                      (TableCfg.derivePulled); never pushed.
const LOCAL_ONLY_COLUMNS = new Set(['synced', 'shared_owner_uid']);

// users is the device identity; the cloud one is auth.users.
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
      // The set matters, not the order.
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
    // A remote NULL in a NOT NULL column without a fallback makes every pull
    // throw on that row. All gaps are collected and reported at once.
    const missing: Record<string, string[]> = {};
    for (const cfg of TABLES) {
      const cols = getDb()
        .getAllSync<{ name: string; notnull: number; dflt_value: string | null }>(
          `PRAGMA table_info(${cfg.table});`
        )
        // Only NOT NULL columns with a schema default; ones without (like
        // goal_entries.amount) are payload, NOT NULL remotely too.
        .filter((c) => c.notnull === 1 && c.dflt_value != null)
        .filter((c) => cfg.cols.includes(c.name))
        .filter((c) => cfg.defaults?.[c.name] === undefined)
        .map((c) => c.name);
      if (cols.length > 0) missing[cfg.table] = cols;
    }
    expect(missing).toEqual({});
  });
});
