// Gives every local data row a new id — the core of the account "merge".
// Ids don't change with the account, so pushing rows that already belong to
// another account's cloud is an UPDATE that RLS rejects, wedging sync. With new
// ids the push INSERTS copies and never touches the old account's rows.
//
// The schema has no ON UPDATE CASCADE, so references are rewritten by hand
// with foreign keys off. SQLite ignores that PRAGMA inside a transaction:
// PRAGMA OFF → BEGIN → updates → COMMIT → PRAGMA ON → foreign_key_check.

import { getDb } from '@/db/database';
import { newId } from '@/lib/helpers';

// Tables whose ids are regenerated, and the columns pointing at them
// (reminders.entity_id has three possible parents, told apart by entity_type).
// `inJson`: the column is a JSON id list (tasks.tag_ids); the quoted id is
// swapped inside it — ids are UUIDs, so the quoted form can't match anything else.
interface IdTable {
  table: string;
  refs: { table: string; column: string; where?: string; inJson?: boolean }[];
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
    table: 'tags',
    refs: [{ table: 'tasks', column: 'tag_ids', inJson: true }],
  },
  {
    table: 'tasks',
    refs: [
      { table: 'subtasks', column: 'task_id' },
      { table: 'reminders', column: 'entity_id', where: "entity_type = 'task'" },
    ],
  },
  // Children's own ids too: they're pushed under their own ids as well.
  { table: 'habit_logs', refs: [] },
  { table: 'subtasks', refs: [] },
  { table: 'goal_milestones', refs: [] },
  { table: 'goal_entries', refs: [] },
  { table: 'reminders', refs: [] },
];

export interface ReassignResult {
  /** Table name -> number of rows whose id changed. */
  counts: Record<string, number>;
  /** Old habit id -> new habit id. */
  habitIdMap: Map<string, string>;
}

// Only ids change, never the data; users (the device identity) is untouched.
// Follow with prepareFullResync + runSync to push the copy.
export function reassignLocalIds(): ReassignResult {
  const db = getDb();
  const counts: Record<string, number> = {};
  const habitIdMap = new Map<string, string>();

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
          if (ref.inJson) {
            db.runSync(
              `UPDATE ${ref.table} SET ${ref.column} = replace(${ref.column}, ?, ?) WHERE instr(${ref.column}, ?) > 0`,
              [JSON.stringify(row.id), JSON.stringify(next), JSON.stringify(row.id)]
            );
            continue;
          }
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

  // We ran with constraints off: verify nothing was left dangling.
  const broken = db.getAllSync<Record<string, unknown>>('PRAGMA foreign_key_check;');
  if (broken.length > 0) {
    throw new Error(`Kimlik yenileme sonrası ${broken.length} kırık referans bulundu`);
  }

  return { counts, habitIdMap };
}
