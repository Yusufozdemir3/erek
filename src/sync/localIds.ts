// LOCAL IDENTITY REGENERATION — the heart of the "merge" (fork) flow.
//
// THE PROBLEM (seen in the field, 2026-07-23): ids are generated on the
// device and DON'T change when the account changes. If the same device's data
// was previously pushed to account A (or an anonymous session), and a push is
// then attempted under account B, Postgres returns:
//   "new row violates row-level security policy (USING expression)"
// Because upsert(onConflict: id) tries to UPDATE the existing row; that row
// belongs to a different uid, and RLS's USING clause hides it from B. Sync
// permanently locks up on that table — the tables behind it never get their turn.
//
// THE FIX: local rows get a NEW id. That makes the push an INSERT instead of
// an update; the old account's cloud rows are never touched, and the conflict
// becomes mathematically impossible. Local data is preserved exactly (only its ids change).
//
// FK ORDER: the schema has NO ON UPDATE CASCADE (see migration001), so
// changing a parent's id would break its children. That's why constraints are
// turned off FOR THE DURATION OF THE TRANSACTION — in SQLite, `PRAGMA
// foreign_keys` has no effect INSIDE a transaction, so the order is: PRAGMA
// OFF → BEGIN → updates → COMMIT → PRAGMA ON → verify with foreign_key_check.

import { getDb } from '@/db/database';
import { newId } from '@/lib/helpers';

// The tables whose ids get regenerated, and the columns that POINT TO them.
// reminders.entity_id points to three possible parents; entity_type disambiguates.
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
  // Child tables' OWN ids also get regenerated: they too get pushed to the
  // cloud with their own ids and can hit the same conflict.
  { table: 'habit_logs', refs: [] },
  { table: 'subtasks', refs: [] },
  { table: 'goal_milestones', refs: [] },
  { table: 'goal_entries', refs: [] },
  { table: 'reminders', refs: [] },
];

export interface ReassignResult {
  /** Table name -> number of rows whose id changed. */
  counts: Record<string, number>;
  /** Old id -> new id (parent tables only; for the caller to map if it wants to). */
  habitIdMap: Map<string, string>;
}

// Assigns a new id to every local data row and updates all internal
// references. The users table is NOT touched (it isn't synced, it's the device identity).
//
// This operation doesn't change the local DATA, only its ids. The caller
// should follow up with prepareFullResync + runSync to push the data to the new account as a copy.
export function reassignLocalIds(): ReassignResult {
  const db = getDb();
  const counts: Record<string, number> = {};
  const habitIdMap = new Map<string, string>();

  // Constraints must be turned off outside a transaction (an SQLite rule).
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

  // We ran with constraints off: EXPLICITLY verify the result is consistent.
  // (A silent broken reference turns into very hard-to-diagnose bugs later.)
  const broken = db.getAllSync<Record<string, unknown>>('PRAGMA foreign_key_check;');
  if (broken.length > 0) {
    throw new Error(`Kimlik yenileme sonrası ${broken.length} kırık referans bulundu`); // "N broken references found after id regeneration"
  }

  return { counts, habitIdMap };
}
