// Sync engine — offline-first, last-writer-wins on updated_at.
//
// One round (runSync):
//   1) ensureSignedIn -> the account uid, or 'disabled' (never an anonymous session).
//   2) PUSH every table's synced=0 rows, then mark them synced=1.
//   3) PULL rows changed since the table's watermark and apply them (deletes
//      too) when newer than the local copy.
//
// Two timestamps, two jobs — don't mix them up:
//   - updated_at        : CLIENT clock, only for the last-writer-wins comparison.
//   - server_updated_at : SERVER clock (trigger), only for the pull filter/watermark.
//
// Identity: local rows keep the device's user_id; it's swapped for the uid on
// push and back on pull, so RLS (auth.uid() = user_id) holds without rewriting local data.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb } from '../db/database';
import { goalRepo } from '../db/repositories/goalRepo';
import { taskRepo } from '../db/repositories/taskRepo';
import { chunk } from '../lib/helpers';
import { emitLocalDataWillChange } from '../lib/localDataEvents';
import { supabase } from './supabase';
import { ensureSignedIn } from './auth';
import { clearSharedData } from './friends';
import { reassignLocalIds } from './localIds';

export interface TableCfg {
  table: string;       // local = remote table name
  cols: string[];      // synced columns (not the local-only 'synced')
  hasUserId: boolean;  // whether user_id is swapped at the boundary
  // Columns of a local UNIQUE/logical key. Two devices can create the same
  // record under different ids (same habit checked on the same day); pull
  // merges them by last-writer-wins instead of hitting the UNIQUE constraint
  // and wedging sync on that row.
  naturalKey?: string[];
  // Fallbacks for remote NULLs in columns that are NOT NULL locally: one bad
  // row from a stale cloud schema would otherwise fail every pull.
  defaults?: Record<string, unknown>;
  // SQL filter on which pending rows may be pushed. Keeps rows owned by
  // someone else (shared with me) out: RLS would reject them and wedge the
  // push, even after prepareFullResync marks everything synced=0.
  pushWhere?: string;
  // Local-only columns derived from a pulled row BEFORE user_id is mapped to
  // the local id (the mapping erases who really owns it).
  derivePulled?: (remote: Record<string, unknown>, myUid: string) => Record<string, unknown>;
}

// In FK order (parent first). Maintained by hand: a column missing here is
// silently never synced. syncColumnParity.test.ts compares it to the local schema.
export const TABLES: TableCfg[] = [
  {
    table: 'goals',
    // current_value is a derived cache (value_baseline + entries), recomputed
    // after every pull; synced only for older clients.
    cols: ['id', 'user_id', 'title', 'goal_type', 'target_value', 'current_value', 'value_baseline', 'unit', 'deadline', 'completed_at', 'remind_at', 'start_date', 'updated_at', 'deleted_at'],
    hasUserId: true,
    defaults: { current_value: 0, value_baseline: 0 },
  },
  {
    table: 'goal_milestones',
    cols: ['id', 'goal_id', 'title', 'completed', 'position', 'amount', 'due_date', 'updated_at', 'deleted_at'],
    hasUserId: false, // owned through the parent goal (RLS too)
    defaults: { completed: 0, position: 0 },
  },
  {
    table: 'goal_entries',
    // added_by: a contributing friend's RAW cloud uid (NULL = the owner), not mapped.
    cols: ['id', 'goal_id', 'amount', 'updated_at', 'deleted_at', 'added_by'],
    hasUserId: false, // owned through the parent goal (RLS too)
  },
  {
    table: 'habits',
    cols: ['id', 'user_id', 'goal_id', 'title', 'kind', 'remind_at', 'icon', 'color', 'schedule', 'target_amount', 'unit', 'start_date', 'end_date', 'skip_dates', 'goal_contribution', 'goal_factor', 'updated_at', 'deleted_at'],
    hasUserId: true,
    defaults: { kind: 'binary', goal_factor: 1 },
  },
  {
    table: 'tasks',
    // shared_with_id: the friend's RAW cloud uid (they have no identity on this device).
    cols: ['id', 'user_id', 'title', 'due_date', 'end_time', 'priority', 'recurrence', 'remind_at', 'completed_at', 'updated_at', 'deleted_at', 'shared_with_id'],
    hasUserId: true,
    defaults: { priority: 'medium' },
    pushWhere: 'shared_owner_uid IS NULL',
    derivePulled: (remote, myUid) => ({
      shared_owner_uid: remote.user_id === myUid ? null : (remote.user_id as string),
    }),
  },
  {
    table: 'reminders',
    cols: ['id', 'entity_type', 'entity_id', 'time', 'updated_at', 'deleted_at'],
    hasUserId: false, // owned through the habit/task/goal it belongs to (RLS too)
    // No local UNIQUE, but the same reminder arriving under another id would
    // otherwise become a second row and fire twice.
    naturalKey: ['entity_type', 'entity_id', 'time'],
  },
  {
    table: 'habit_logs',
    cols: ['id', 'habit_id', 'log_date', 'completed', 'amount', 'updated_at'],
    hasUserId: false,
    naturalKey: ['habit_id', 'log_date'], // local: UNIQUE(habit_id, log_date)
    defaults: { completed: 0, amount: 0 },
  },
  {
    table: 'subtasks',
    cols: ['id', 'task_id', 'title', 'completed', 'position', 'updated_at', 'deleted_at'],
    hasUserId: false, // owned through the parent task (RLS too)
    defaults: { completed: 0, position: 0 },
    // Subtasks of a task shared WITH me are pulled but never pushed back.
    pushWhere: 'task_id NOT IN (SELECT id FROM tasks WHERE shared_owner_uid IS NOT NULL)',
  },
];

// One watermark PER TABLE: a shared one let a table whose rows were older than
// another table's newest row fall behind `since` and never be pulled again.
const watermarkKey = (table: string) => `sync:lastPulledAt:${table}`;

const EPOCH = '1970-01-01T00:00:00.000Z';

// The pull ledger uses the SERVER timestamp: a client clock set ahead would
// otherwise poison the watermark and skip every row in between.
const SERVER_TS_COL = 'server_updated_at';

// The watermark is kept this far BEHIND the newest row seen. The trigger's
// now() is the transaction START time, so a transaction that starts late but
// commits early can carry a larger timestamp than one still committing; going
// straight to the max would skip the latter forever. Re-reading a few seconds
// of rows is harmless (pull is idempotent).
const WATERMARK_SAFETY_MS = 5_000;

// Supabase returns at most 1000 rows per response.
const PULL_PAGE_SIZE = 1000;

// Push goes out in smaller batches, each marked synced as soon as it lands:
// one giant all-or-nothing request (a full resync on a long-time account) can
// time out on mobile and never make progress. A retry only sends what's left.
const PUSH_PAGE_SIZE = 250;

// Which cloud account this device's data belongs to, written after the first
// successful sync. Local ids don't change with the account, so pushing them
// under another account hits RLS; this marker detects a switch beforehand.
const OWNER_UID_KEY = 'sync:ownerUid';

let inFlight = false; // never two rounds at once

export interface SyncResult {
  // 'busy' is not an error: automatic triggers (startup, foreground) can
  // collide with a manual round, and an error would hide the real one on screen.
  status: 'ok' | 'disabled' | 'error' | 'busy';
  pushed?: number;
  pulled?: number;
  at?: number;        // epoch ms
  message?: string;   // error message
  /** The error is a data-ownership conflict (see isOwnershipConflict). */
  ownershipConflict?: boolean;
}

// What a sign-in means for local data:
//   'fresh'  — not pushed to any account yet: upload it to this one.
//   'same'   — already this account's: a normal sync.
//   'switch' — belongs to ANOTHER account (see resolveAccountSwitch).
export type SignInKind = 'fresh' | 'same' | 'switch';

export async function getSyncOwner(): Promise<string | null> {
  return AsyncStorage.getItem(OWNER_UID_KEY);
}

export async function setSyncOwner(uid: string): Promise<void> {
  await AsyncStorage.setItem(OWNER_UID_KEY, uid);
}

export async function classifySignIn(uid: string): Promise<SignInKind> {
  const owner = await getSyncOwner();
  if (owner === null) return 'fresh';
  return owner === uid ? 'same' : 'switch';
}

// An RLS rejection: push upserts by id, and updating a row owned by another
// uid is blocked by the USING clause. Callers turn it into an understandable message.
export function isOwnershipConflict(message: string): boolean {
  return (
    message.includes('row-level security') ||
    message.includes('violates row-level security policy')
  );
}

const ts = (s: string | null | undefined): number => (s ? new Date(s).getTime() : 0);

// The newest timestamp seen minus the safety margin, never moving backward.
function nextWatermark(maxServerTs: string, since: string): string {
  const t = ts(maxServerTs);
  if (!t) return since;
  const rewound = new Date(t - WATERMARK_SAFETY_MS).toISOString();
  return ts(rewound) > ts(since) ? rewound : since;
}

// PostgREST's "Could not find the 'x' column" means the cloud schema is older
// than the client (a column was added): supabase/schema.sql must be re-run.
function schemaHint(message: string): string {
  const stale =
    message.includes('schema cache') ||
    message.includes('Could not find') ||
    message.includes(SERVER_TS_COL);
  return stale ? ` (Supabase şeması eski görünüyor — supabase/schema.sql'i yeniden çalıştırın)` : '';
}

async function clearWatermarks(): Promise<void> {
  await AsyncStorage.multiRemove(TABLES.map((c) => watermarkKey(c.table)));
}

// Marks every local row for upload and resets the watermarks, so the next
// runSync uploads local data under the current uid and pulls the account from scratch.
export async function prepareFullResync(): Promise<void> {
  const db = getDb();
  for (const cfg of TABLES) {
    db.runSync(`UPDATE ${cfg.table} SET synced = 0`);
  }
  await clearWatermarks();
}

// — RESOLVING AN ACCOUNT SWITCH — both only prepare; the next runSync moves the data.

// MERGE: local data goes into the new account too. Rows get new ids
// (localIds.ts), so push INSERTS them and never touches the old account's rows.
export async function prepareMergeIntoAccount(): Promise<void> {
  // Before ids change, let holders of old ids (the running timer) flush.
  emitLocalDataWillChange();
  // First: tasks shared with me belong to the old account's friends; with new
  // ids they would be pushed as copies owned by the new account.
  await clearSharedData();
  reassignLocalIds();
  await prepareFullResync();
  // The saved timer points at an old habit id that no longer exists.
  await AsyncStorage.removeItem('timer:active');
}

// REPLACE: the device mirrors the account — local data is DELETED and
// downloaded again. Irreversible.
export async function prepareReplaceWithAccount(): Promise<void> {
  await clearLocalData();
  await AsyncStorage.removeItem('timer:active');
  await clearSharedData();
}

// Data belongs to the account: signing in uploads the device's data ('fresh'),
// signing out removes it from the device (forgetAccountOnDevice) — so the next
// sign-in, with any account, starts clean. The only question the user ever
// sees is a data-loss warning when changes haven't reached the cloud yet.

// Local changes not yet in the cloud (rows push would send). Works offline.
export function pendingChangeCount(): number {
  const db = getDb();
  let n = 0;
  for (const cfg of TABLES) {
    const row = db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${cfg.table} WHERE synced = 0${cfg.pushWhere ? ` AND (${cfg.pushWhere})` : ''}`
    );
    n += row?.n ?? 0;
  }
  return n;
}

// Sign-out, device side: wipe the account's data (it lives in the cloud) and
// the owner marker. The caller signs out first and has already warned about pendingChangeCount().
export async function forgetAccountOnDevice(): Promise<void> {
  await clearLocalData(); // also flushes/stops a running timer (localDataEvents)
  await clearSharedData();
  await AsyncStorage.multiRemove([OWNER_UID_KEY, 'timer:active']);
}

// Data stamped with ANOTHER account (only left behind by older versions,
// whose sign-out kept everything) is resolved without asking:
//   - nothing pending -> it's all in that account's cloud: REPLACE,
//   - pending changes -> some rows exist nowhere else: MERGE, so none is lost.
export async function resolveAccountSwitch(): Promise<'merge' | 'replace'> {
  if (pendingChangeCount() > 0) {
    await prepareMergeIntoAccount();
    return 'merge';
  }
  await prepareReplaceWithAccount();
  return 'replace';
}

// Deletes all local DATA (the local user row stays) and the watermarks.
// Children first: TABLES is walked in reverse.
export async function clearLocalData(): Promise<void> {
  emitLocalDataWillChange(); // see prepareMergeIntoAccount
  const db = getDb();
  db.execSync('BEGIN;');
  try {
    for (const cfg of [...TABLES].reverse()) db.runSync(`DELETE FROM ${cfg.table}`);
    db.execSync('COMMIT;');
  } catch (e) {
    try {
      db.execSync('ROLLBACK;');
    } catch {}
    throw e;
  }
  await clearWatermarks();
}

// Sends a table's pending rows in batches (see PUSH_PAGE_SIZE).
async function pushTable(cfg: TableCfg, uid: string): Promise<number> {
  const db = getDb();
  let pushed = 0;
  // Paged by an id cursor, not just LIMIT: a row edited during push stays
  // synced=0 on purpose, and `WHERE synced = 0 LIMIT n` would reselect it
  // forever. It goes out next round instead.
  let cursor = '';
  for (;;) {
    const batch = db.getAllSync<any>(
      `SELECT ${cfg.cols.join(', ')} FROM ${cfg.table}
       WHERE synced = 0 AND id > ? ${cfg.pushWhere ? `AND (${cfg.pushWhere})` : ''}
       ORDER BY id LIMIT ?`,
      [cursor, PUSH_PAGE_SIZE]
    );
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    const payload = batch.map((r) => (cfg.hasUserId ? { ...r, user_id: uid } : r));
    const { error } = await supabase!.from(cfg.table).upsert(payload, { onConflict: 'id' });
    // Batches marked before a throw stay marked: they did reach the cloud.
    if (error) throw new Error(`${cfg.table} push: ${error.message}${schemaHint(error.message)}`);

    // Mark only rows still exactly as sent; one edited meanwhile goes out next round.
    for (const r of batch) {
      db.runSync(
        `UPDATE ${cfg.table} SET synced = 1 WHERE id = ? AND updated_at = ?`,
        [r.id, r.updated_at]
      );
    }
    pushed += batch.length;
  }
  return pushed;
}

// Writes a remote row locally as synced=1.
function upsertLocal(cfg: TableCfg, obj: any, derived: Record<string, unknown> = {}): void {
  const db = getDb();
  const derivedCols = Object.keys(derived);
  const dataCols = [...cfg.cols, ...derivedCols];
  const allCols = [...dataCols, 'synced'];
  const placeholders = allCols.map(() => '?').join(', ');
  const updates = dataCols
    .map((c) => `${c} = excluded.${c}`)
    .concat('synced = excluded.synced')
    .join(', ');
  const vals = cfg.cols
    .map((c) => obj[c] ?? cfg.defaults?.[c] ?? null)
    .concat(derivedCols.map((c) => derived[c] ?? null))
    .concat(1);
  db.runSync(
    `INSERT INTO ${cfg.table} (${allCols.join(', ')}) VALUES (${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${updates}`,
    vals
  );
}

// Applies one remote row by last-writer-wins; false if the local copy is newer.
function applyRemoteRow(cfg: TableCfg, r: any, localUserId: string, myUid: string): boolean {
  const db = getDb();
  const derived = cfg.derivePulled ? cfg.derivePulled(r, myUid) : {};
  const mapped = cfg.hasUserId ? { ...r, user_id: localUserId } : r;

  // 1) Same id locally: newer wins, local wins a tie.
  const byId = db.getFirstSync<any>(
    `SELECT updated_at FROM ${cfg.table} WHERE id = ?`,
    [r.id]
  );
  if (byId) {
    if (ts(byId.updated_at) >= ts(r.updated_at)) return false;
    upsertLocal(cfg, mapped, derived);
    return true;
  }

  // 2) New id but the natural key collides: if remote wins, the local rival is
  // deleted and the remote row written.
  // Only LIVE rows compete. A tombstone means "this id was deleted", not "this
  // slot is taken": saving a form deletes a reminder and recreates the same
  // time under a new id in the same millisecond, and a tombstone arriving
  // first used to win the tie and drop the live row for good. So a remote
  // tombstone never displaces a live row, and a live remote row never loses to a local tombstone.
  const softDelete = cfg.cols.includes('deleted_at');
  if (cfg.naturalKey && !(softDelete && r.deleted_at)) {
    const where =
      cfg.naturalKey.map((k) => `${k} = ?`).join(' AND ') + (softDelete ? ' AND deleted_at IS NULL' : '');
    const rival = db.getFirstSync<any>(
      `SELECT id, updated_at FROM ${cfg.table} WHERE ${where}`,
      cfg.naturalKey.map((k) => r[k])
    );
    if (rival) {
      if (ts(rival.updated_at) >= ts(r.updated_at)) return false;
      db.runSync(`DELETE FROM ${cfg.table} WHERE id = ?`, [rival.id]);
    }
  }

  upsertLocal(cfg, mapped, derived);
  return true;
}

// Pulls rows changed since `since`, page by page until exhausted: advancing
// the watermark past a truncated response would lose the rest for good.
async function pullTable(
  cfg: TableCfg,
  localUserId: string,
  myUid: string,
  since: string
): Promise<{ count: number; maxServerTs: string }> {
  let maxServerTs = since;
  let count = 0;

  for (let from = 0; ; from += PULL_PAGE_SIZE) {
    // id as the second sort key keeps page boundaries stable on equal timestamps.
    const { data, error } = await supabase!
      .from(cfg.table)
      .select([...cfg.cols, SERVER_TS_COL].join(','))
      .gt(SERVER_TS_COL, since)
      .order(SERVER_TS_COL, { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PULL_PAGE_SIZE - 1);
    if (error) throw new Error(`${cfg.table} pull: ${error.message}${schemaHint(error.message)}`);

    for (const remote of data ?? []) {
      const r = remote as any;
      if (applyRemoteRow(cfg, r, localUserId, myUid)) count++;
      if (ts(r[SERVER_TS_COL]) > ts(maxServerTs)) maxServerTs = r[SERVER_TS_COL];
    }

    if (!data || data.length < PULL_PAGE_SIZE) break; // last page
  }

  return { count, maxServerTs };
}

// A task shared WITH me just stops arriving when the share ends (no tombstone),
// so after each pull, local shared-with-me rows the server no longer shows are
// dropped. Keyed by local ids (chunked); skipped when there are none.
async function reconcileSharedTasks(uid: string): Promise<number> {
  const local = taskRepo.listSharedWithMeIds();
  if (local.length === 0) return 0;
  const live = new Set<string>();
  for (const ids of chunk(local)) {
    const { data, error } = await supabase!
      .from('tasks')
      .select('id')
      .in('id', ids)
      .eq('shared_with_id', uid)
      .is('deleted_at', null);
    if (error) throw new Error(`tasks reconcile: ${error.message}`);
    for (const r of data ?? []) live.add((r as any).id);
  }
  const gone = local.filter((id) => !live.has(id));
  return gone.length > 0 ? taskRepo.purgeSharedWithMe(gone) : 0;
}

export async function runSync(localUserId: string): Promise<SyncResult> {
  if (!supabase) return { status: 'disabled' };
  if (inFlight) return { status: 'busy', message: 'Senkron zaten sürüyor' };
  inFlight = true;
  try {
    const uid = await ensureSignedIn();
    if (!uid) return { status: 'disabled' };

    let pushed = 0;
    for (const cfg of TABLES) pushed += await pushTable(cfg, uid);

    let pulled = 0;
    for (const cfg of TABLES) {
      const since = (await AsyncStorage.getItem(watermarkKey(cfg.table))) ?? EPOCH;
      const { count, maxServerTs } = await pullTable(cfg, localUserId, uid, since);
      pulled += count;
      const next = nextWatermark(maxServerTs, since);
      if (ts(next) > ts(since)) {
        await AsyncStorage.setItem(watermarkKey(cfg.table), next);
      }
    }

    await reconcileSharedTasks(uid);

    // Goal progress is re-derived from the entries (merged row by row) once
    // they've all landed; the pulled current_value is a stale cache that
    // would erase this device's contributions.
    goalRepo.recomputeAllFromEntries();

    await setSyncOwner(uid);
    return { status: 'ok', pushed, pulled, at: Date.now() };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      status: 'error',
      message,
      ownershipConflict: isOwnershipConflict(message),
    };
  } finally {
    inFlight = false;
  }
}
