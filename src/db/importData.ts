// "Import my data": the other half of the export (exportData.ts) — move your
// habits, tasks and goals to a new phone, or restore them after a reset.
//
// A file is untrusted input, so nothing in it is executed or interpolated:
//   - only tables and columns that really exist are written (column names come
//     from the live schema via PRAGMA table_info, never from the file);
//   - every value is checked against its column's declared type; a row with a
//     wrong type, a missing required field or a missing parent is SKIPPED, the
//     rest of the file still imports;
//   - text is length-capped, JSON columns must parse, ids must look like ids;
//   - everything runs in ONE transaction: a crash halfway leaves the database as it was.
//
// Importing is additive and idempotent: a row whose id already exists on this
// phone is left alone (importing the same file twice changes nothing, and a
// habit you deleted since the export is not brought back). Imported rows belong
// to the current user and are marked for the next sync.

import { getDb } from './database';
import { EXPORT_FORMAT_VERSION, type ExportDocument } from './exportData';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 100_000;
const MAX_TEXT_LEN = 2000;
const MAX_JSON_LEN = 4000;
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

// Parents before children (foreign keys are on). `key` is the property in the
// document; `table` the SQLite table; `owned` = the table has its own user_id.
const PLAN = [
  { key: 'habits', table: 'habits', owned: true },
  { key: 'habitLogs', table: 'habit_logs', owned: false },
  { key: 'tasks', table: 'tasks', owned: true },
  { key: 'subtasks', table: 'subtasks', owned: false },
  { key: 'goals', table: 'goals', owned: true },
  { key: 'goalMilestones', table: 'goal_milestones', owned: false },
  { key: 'goalEntries', table: 'goal_entries', owned: false },
  { key: 'reminders', table: 'reminders', owned: false },
] as const;
type Key = (typeof PLAN)[number]['key'];

// Columns the file never controls.
const NEVER_FROM_FILE = new Set(['user_id', 'synced', 'deleted_at', 'shared_with_id', 'shared_owner_uid', 'added_by']);
// Columns that hold JSON text (a recurrence or schedule rule).
const JSON_COLUMNS = new Set(['schedule', 'recurrence']);

export type ParseResult = { ok: true; doc: ExportDocument } | { ok: false; reason: 'tooLarge' | 'notJson' | 'notErek' | 'newerVersion' | 'empty' };

export function parseExport(text: string): ParseResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, reason: 'tooLarge' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'notJson' };
  }
  const d = raw as Partial<ExportDocument> | null;
  if (!d || typeof d !== 'object' || d.app !== 'Erek') return { ok: false, reason: 'notErek' };
  if (typeof d.formatVersion !== 'number' || d.formatVersion > EXPORT_FORMAT_VERSION) return { ok: false, reason: 'newerVersion' };
  const doc = d as ExportDocument;
  let rows = 0;
  for (const { key } of PLAN) {
    const list = (doc as unknown as Record<string, unknown>)[key];
    (doc as unknown as Record<string, unknown>)[key] = Array.isArray(list) ? list : [];
    rows += (list as unknown[] | undefined)?.length ?? 0;
  }
  if (rows === 0) return { ok: false, reason: 'empty' };
  if (rows > MAX_IMPORT_ROWS) return { ok: false, reason: 'tooLarge' };
  return { ok: true, doc };
}

// What the file holds, by kind — shown before the user confirms.
export function summarize(doc: ExportDocument): Record<Key, number> {
  return Object.fromEntries(PLAN.map(({ key }) => [key, (doc[key] as unknown[]).length])) as Record<Key, number>;
}

interface Column {
  name: string;
  type: string; // declared type, upper-case ("TEXT", "INTEGER", "REAL")
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

function columnsOf(table: string): Column[] {
  return getDb()
    .getAllSync<Column>(`PRAGMA table_info(${table})`)
    .map((c) => ({ ...c, type: (c.type ?? '').toUpperCase() }));
}

// A cleaned value for the column, or `undefined` = this row is unusable.
function clean(col: Column, value: unknown): string | number | null | undefined {
  if (value === null || value === undefined) return null;
  if (col.type.includes('INT')) {
    return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) ? value : undefined;
  }
  if (col.type.includes('REAL') || col.type.includes('FLOA') || col.type.includes('DOUB')) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== 'string') return undefined;
  if (JSON_COLUMNS.has(col.name)) {
    if (value.length > MAX_JSON_LEN) return undefined;
    try {
      JSON.parse(value);
    } catch {
      return undefined;
    }
    return value;
  }
  if (col.pk && !ID_RE.test(value)) return undefined;
  return value.length > MAX_TEXT_LEN ? undefined : value;
}

export interface ImportReport {
  imported: Record<Key, number>;
  existing: number; // already on this phone (same id) — left as they were
  skipped: number; // unusable rows (wrong type, missing field, missing parent)
}

// Writes the document for `userId`. All or nothing: any unexpected error rolls
// the whole import back and is rethrown.
export function importData(userId: string, doc: ExportDocument, now: Date = new Date()): ImportReport {
  const db = getDb();
  const stamp = now.toISOString();
  const imported = Object.fromEntries(PLAN.map(({ key }) => [key, 0])) as Record<Key, number>;
  let existing = 0;
  let skipped = 0;

  db.execSync('BEGIN;');
  try {
    for (const { key, table, owned } of PLAN) {
      const cols = columnsOf(table);
      const byName = new Map(cols.map((c) => [c.name, c]));
      for (const row of doc[key] as Record<string, unknown>[]) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          skipped++;
          continue;
        }
        const names: string[] = [];
        const values: (string | number | null)[] = [];
        let usable = true;

        for (const [name, value] of Object.entries(row)) {
          const col = byName.get(name);
          if (!col || NEVER_FROM_FILE.has(name)) continue; // unknown or reserved column: ignored
          const v = clean(col, value);
          if (v === undefined) {
            usable = false;
            break;
          }
          names.push(name);
          values.push(v);
        }
        if (!usable || !names.includes('id')) {
          skipped++;
          continue;
        }
        if (owned) {
          names.push('user_id');
          values.push(userId);
        }
        if (!names.includes('updated_at') || values[names.indexOf('updated_at')] === null) {
          if (names.includes('updated_at')) values[names.indexOf('updated_at')] = stamp;
          else {
            names.push('updated_at');
            values.push(stamp);
          }
        }
        names.push('synced');
        values.push(0);

        // Every required column must be present (or have a default).
        const missing = cols.some(
          (c) => c.notnull && c.dflt_value === null && !c.pk && !names.includes(c.name) && c.type !== ''
        );
        if (missing) {
          skipped++;
          continue;
        }

        try {
          // Column names are the schema's own (whitelisted above); values are bound.
          const r = db.runSync(
            `INSERT OR IGNORE INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
            values
          ) as unknown as { changes?: number } | undefined;
          if ((r?.changes ?? 1) > 0) imported[key]++;
          else existing++;
        } catch {
          // e.g. a missing parent (foreign key) or a CHECK failure: this row only.
          skipped++;
        }
      }
    }
    db.execSync('COMMIT;');
  } catch (e) {
    try {
      db.execSync('ROLLBACK;');
    } catch {
      // the failure may have closed the transaction already
    }
    throw e;
  }
  return { imported, existing, skipped };
}
