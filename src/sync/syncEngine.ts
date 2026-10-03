// Sync engine — offline-first, last-writer-wins (updated_at).
//
// Flow:
//   1) ensureSignedIn -> the account uid; if not signed in, returns null and
//      sync exits with 'disabled' (an anonymous session is NEVER opened — see sync/auth.ts).
//   2) PUSH: upsert every table's synced=0 rows to Supabase, then mark synced=1
//   3) PULL: fetch remote rows changed since the last sync, apply them (including
//      deletes) if newer than the local one per updated_at, and write synced=1.
//      In habit_logs, rows that collide on (habit_id, log_date) even with a
//      different id are merged into a SINGLE record via last-writer-wins (naturalKey).
//
// Timestamps serve two different purposes — don't mix them up:
//   - updated_at        : the CLIENT clock. Only used for the last-writer-wins comparison.
//   - server_updated_at : the SERVER clock (trigger). Only used for the pull filter + watermark.
// The watermark is per table (sync:lastPulledAt:<table>).
//
// Identity mapping: the local device's user_id is preserved; on push, user_id
// is converted to the uid, and on pull, user_id is converted to the local id.
// This satisfies RLS (auth.uid() = user_id) without ever rewriting local data.
//
// FK order matters: goals -> habits -> tasks -> habit_logs (parent first).

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
  table: string;       // the local = remote table name
  cols: string[];      // the synced columns (excludes the local-only 'synced')
  hasUserId: boolean;  // whether user_id is converted at the boundary
  // The "natural key" columns backed by a local UNIQUE constraint. Two devices
  // can produce the same logical record under different ids (e.g. the same
  // habit checked on the same day on two devices). Pull finds the colliding
  // record by these columns and merges it via last-writer-wins; otherwise the
  // INSERT would hit the local UNIQUE constraint and permanently lock sync on that row.
  naturalKey?: string[];
  // Values to use when the remote value is NULL. Only needed for columns that
  // are NOT NULL locally: upsertLocal writes an empty value via `?? null`, and
  // if that hits the NOT NULL constraint, the pull THROWS — meaning a single
  // missing field PERMANENTLY breaks that user's sync (failing on the same row
  // every round). This shouldn't happen with a correctly set up cloud schema;
  // this defense just keeps a hand-edited or stale cloud schema from letting one row lock up everything.
  defaults?: Record<string, unknown>;
  // Extra SQL condition on which pending rows may be PUSHED. Used to keep rows
  // owned by someone else (shared with me) out of the push entirely: pushing
  // one would be rejected by RLS and wedge the sync. Enforced here, in SQL, so
  // even prepareFullResync (which marks everything synced=0) can't leak them.
  pushWhere?: string;
  // LOCAL-ONLY columns derived from a pulled remote row BEFORE user_id is
  // mapped to the local id (that mapping erases who really owns the row).
  derivePulled?: (remote: Record<string, unknown>, myUid: string) => Record<string, unknown>;
}

// Ordered by FK dependency (parent first).
//
// EXPORTED BECAUSE IT'S TESTED: this list is maintained BY HAND, and its link
// to the local schema isn't checked by the compiler. Forgetting to update it
// when a migration adds a new column produces SILENT data loss — the column
// is never sent on push, never written on pull, and that field silently
// diverges between two devices. This exact thing happened:
// goal_contribution/goal_factor (migration010) were missing from this list
// for months, and a unit-multiplier goal contribution fell back to the
// default on a second device.
// __tests__/syncColumnParity.test.ts compares this list against PRAGMA
// table_info; if you add a column and forget this list, that test fails.
export const TABLES: TableCfg[] = [
  {
    table: 'goals',
    // current_value is now a DERIVED cache (= value_baseline + the sum of
    // entries, see migration019). It's still synced: older clients read it,
    // and it gets recomputed right after pull anyway
    // (goalRepo.recomputeAllFromEntries). The data that actually merges
    // without conflict is the goal_entries rows.
    cols: ['id', 'user_id', 'title', 'goal_type', 'target_value', 'current_value', 'value_baseline', 'unit', 'deadline', 'completed_at', 'remind_at', 'start_date', 'updated_at', 'deleted_at'],
    hasUserId: true,
    defaults: { current_value: 0, value_baseline: 0 },
  },
  {
    table: 'goal_milestones',
    cols: ['id', 'goal_id', 'title', 'completed', 'position', 'amount', 'due_date', 'updated_at', 'deleted_at'],
    hasUserId: false, // ownership flows through the parent goal (RLS too)
    defaults: { completed: 0, position: 0 },
  },
  {
    table: 'goal_entries',
    // added_by: the RAW cloud uid of a friend who contributed to a shared goal
    // (NULL = the owner). No local-id mapping, same as tasks.shared_with_id.
    cols: ['id', 'goal_id', 'amount', 'updated_at', 'deleted_at', 'added_by'],
    hasUserId: false, // ownership flows through the parent goal (RLS too)
  },
  {
    table: 'habits',
    // goal_contribution/goal_factor (migration010) were added to this list
    // LATER — while missing, the "amount × factor" contribution to a linked
    // goal was only correct on the device that created it; a second device
    // saw the NULL/1 default and wrote the wrong progress to the goal
    // (see migration018 + the syncColumnParity test).
    cols: ['id', 'user_id', 'goal_id', 'title', 'kind', 'remind_at', 'icon', 'color', 'schedule', 'target_amount', 'unit', 'start_date', 'end_date', 'goal_contribution', 'goal_factor', 'updated_at', 'deleted_at'],
    hasUserId: true,
    // Columns that are NOT NULL locally — if empty from remote, fall back to
    // the schema's own default instead of dropping the row (and with it, all of sync).
    defaults: { kind: 'binary', goal_factor: 1 },
  },
  {
    table: 'tasks',
    // shared_with_id is the friend's RAW cloud uid (no local-id mapping: the
    // friend has no identity on this device).
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
    hasUserId: false, // ownership flows through the entity_type parent (habit/task/goal) (RLS too)
    // There's NO local UNIQUE constraint, but logically an entity can't have
    // two reminders at the same time (the form doesn't add one either).
    // Without the natural key, the same reminder arriving with a different id
    // gets added as a SECOND row -> the notification fires twice.
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
    hasUserId: false, // ownership flows through the parent task (RLS too)
    defaults: { completed: 0, position: 0 },
    // Subtasks of a task shared WITH me arrive on pull (the friend's RLS reaches
    // them) but are someone else's rows: never pushed back. Without this, a
    // full resync (every row marked synced=0) would push them and RLS would
    // reject the batch.
    pushWhere: 'task_id NOT IN (SELECT id FROM tasks WHERE shared_owner_uid IS NOT NULL)',
  },
];

// The OLD single-global watermark. No longer written; only ever read during
// the "clear it if present" migration (see migrateWatermarks).
const LEGACY_LAST_PULLED_KEY = 'sync:lastPulledAt';

// The watermark is now kept PER TABLE. A single global watermark used to
// produce this silent data loss: all tables were pulled with the same
// `since`, and the watermark was set to the MAX across all tables; a table
// whose row had an older timestamp then fell behind `since` on the next round
// and was NEVER pulled again.
const watermarkKey = (table: string) => `sync:lastPulledAt:${table}`;

const EPOCH = '1970-01-01T00:00:00.000Z';

// The pull filter/watermark looks at the SERVER timestamp (written by
// trigger, see supabase/schema.sql). Since `updated_at` comes from the client
// clock, a device with a clock set ahead could poison the watermark and skip
// every row in between. The last-writer-wins comparison is still done with
// `updated_at` (it tells us when the record actually changed); the server
// timestamp is only the "what I've pulled" ledger.
const SERVER_TS_COL = 'server_updated_at';

// The SAFETY MARGIN left behind when advancing the watermark.
//
// server_updated_at is written in the trigger with now(), and in Postgres
// now() is the TRANSACTION START time. So a transaction that starts late but
// commits early can carry a LARGER timestamp than one that started early but
// commits late. Setting the watermark to "the largest timestamp I've seen"
// would mean permanently skipping the row in between: it would never satisfy
// `> since` again, i.e. silent data loss.
//
// This went unnoticed for a long time because the full resync that ran on
// every login (resetting all watermarks) accidentally healed the loss. Now
// that round only runs when actually needed (see LoginScreen: skipped for a
// 'same' account), the gap itself had to be closed — leaving a margin just
// means a few seconds' worth of rows get re-read, which is harmless since pull is idempotent (last-writer-wins).
const WATERMARK_SAFETY_MS = 5_000;

// Supabase returns at most 1000 rows per response; anything beyond that is paginated.
const PULL_PAGE_SIZE = 1000;

// Push also goes out in batches, deliberately SMALLER than pull's: on pull the
// limit is the server's response cap, while on push it's how big the REQUEST
// BODY can be before timing out on a mobile network. There used to be no
// batching — ALL pending rows went out in a single upsert, which could
// produce this permanent lockup: prepareFullResync (runs on every login)
// marks every row synced=0; for a long-time user that's thousands of rows. If
// that one giant request times out, NO row becomes synced=1 (all-or-nothing),
// the next round retries the same giant request, and sync never makes
// progress again. Because marking happens per batch, successful batches are
// now permanent: a retry only sends what's left.
const PUSH_PAGE_SIZE = 250;

// WHICH cloud account this device's data belongs to. Written after the first
// successful sync, and the only reliable way to detect an account switch:
// local ids DON'T change when the account changes, so a row that was pushed
// to account A gets caught by RLS's USING clause when a push is attempted
// under account B, permanently locking sync (seen in the field, 2026-07-23).
// This flag lets the user be asked "merge or replace?" BEFORE the conflict ever happens.
const OWNER_UID_KEY = 'sync:ownerUid';

let inFlight = false; // don't let two syncs run at once

export interface SyncResult {
  // 'busy' is NOT an error: it means another round is currently running. This
  // needs to be its own state — automatic triggers (startup + coming to the
  // foreground) can collide with a manually started round, and returning
  // 'error' would show the user an error when nothing is actually wrong, and
  // worse, would clobber the real error already on screen.
  status: 'ok' | 'disabled' | 'error' | 'busy';
  pushed?: number;
  pulled?: number;
  at?: number;        // epoch ms
  message?: string;   // error message
  /** If true, the error is a data-ownership conflict (see isOwnershipConflict). */
  ownershipConflict?: boolean;
}

// What a sign-in attempt means with respect to local data:
//   'fresh'  — this device's data hasn't been pushed to any account yet; it
//              can be uploaded straight to this one (the normal path from anonymous use into an account).
//   'same'   — it already belonged to this account; a normal sync.
//   'switch' — the data belongs to a DIFFERENT account; the user must choose "merge/replace".
export type SignInKind = 'fresh' | 'same' | 'switch';

export async function getSyncOwner(): Promise<string | null> {
  return AsyncStorage.getItem(OWNER_UID_KEY);
}

export async function setSyncOwner(uid: string): Promise<void> {
  await AsyncStorage.setItem(OWNER_UID_KEY, uid);
}

// Classifies the account being signed into relative to local data.
export async function classifySignIn(uid: string): Promise<SignInKind> {
  const owner = await getSyncOwner();
  if (owner === null) return 'fresh';
  return owner === uid ? 'same' : 'switch';
}

// Recognizes a Postgres RLS rejection. Since push is upsert(onConflict: id),
// it tries to UPDATE an existing row; if the row belongs to a different uid,
// the USING clause blocks it. The raw message tells the user nothing (and no
// way to fix it), so the caller catches this and offers an understandable choice.
export function isOwnershipConflict(message: string): boolean {
  return (
    message.includes('row-level security') ||
    message.includes('violates row-level security policy')
  );
}

const ts = (s: string | null | undefined): number => (s ? new Date(s).getTime() : 0);

// The value to write for the watermark: the largest timestamp seen, minus the
// safety margin, but never moving it backward (see WATERMARK_SAFETY_MS).
function nextWatermark(maxServerTs: string, since: string): string {
  const t = ts(maxServerTs);
  if (!t) return since;
  const rewound = new Date(t - WATERMARK_SAFETY_MS).toISOString();
  return ts(rewound) > ts(since) ? rewound : since;
}

// If the cloud schema doesn't carry the columns the client expects,
// PostgREST's raw message ("Could not find the 'x' column ... in the schema
// cache") tells the user nothing and no way to fix it. Whenever a column is
// ADDED on the client (e.g. migration018 + goal_contribution/goal_factor),
// re-running supabase/schema.sql is MANDATORY; otherwise push permanently
// fails on that table. The pull side already had this same hint — the push
// side didn't, and push is exactly the path that will actually fire on the next release.
function schemaHint(message: string): string {
  const stale =
    message.includes('schema cache') ||
    message.includes('Could not find') ||
    message.includes(SERVER_TS_COL);
  return stale ? ` (Supabase şeması eski görünüyor — supabase/schema.sql'i yeniden çalıştırın)` : '';
}

// Clears all watermarks (account switch / full resync).
async function clearWatermarks(): Promise<void> {
  await AsyncStorage.multiRemove([
    LEGACY_LAST_PULLED_KEY,
    ...TABLES.map((c) => watermarkKey(c.table)),
  ]);
}

// Migrates from the single-global watermark to per-table watermarks. We
// deliberately do NOT copy the old key's value onto the tables: the old
// scheme may already have skipped some tables' rows, and inheriting that
// value would make the loss permanent. Instead the old key is deleted and
// tables are pulled once from epoch (pull is idempotent: last-writer-wins, a
// row that's newer locally isn't overwritten) — this is how skipped rows recover.
async function migrateWatermarks(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_LAST_PULLED_KEY);
}

// Called when the account changes (sign-in / sign-out). Marks all local rows
// "waiting to be sent" (synced=0) and resets the pull watermark. This way:
//   - local data gets re-uploaded under the new uid (becoming that account's backup),
//   - all of the new account's existing cloud data is pulled from scratch.
// The next runSync does the actual work.
export async function prepareFullResync(): Promise<void> {
  const db = getDb();
  for (const cfg of TABLES) {
    db.runSync(`UPDATE ${cfg.table} SET synced = 0`);
  }
  await clearWatermarks();
}

// — TWO WAYS TO RESOLVE AN ACCOUNT SWITCH —
// Both are only preparation: the next runSync is what actually moves the data.
//
// MERGE (fork): local data should also go into the NEW account. Rows get new
// ids (see localIds.ts) — so the push doesn't try to update an existing row,
// it INSERTS one; the old account's cloud rows are left untouched and an RLS
// conflict becomes mathematically impossible. Local data is preserved.
export async function prepareMergeIntoAccount(): Promise<void> {
  // Before any id changes: in-memory holders of ids (the running timer) flush
  // while the old ids are still valid (see lib/localDataEvents.ts).
  emitLocalDataWillChange();
  // FIRST: tasks shared with me belong to the previous account's friends. If
  // they got new ids below, they'd be pushed as COPIES owned by the new account.
  await clearSharedData();
  reassignLocalIds();
  await prepareFullResync();
  // Timer state holds the old habit id; since identities changed it no longer
  // matches any row -> committing it would lose data. Reset it.
  await AsyncStorage.removeItem('timer:active');
}

// REPLACE: the device should mirror the account being signed into. Local data
// is DELETED and that account's cloud data is downloaded from scratch.
// Irreversible — the caller must not use this without confirmation.
export async function prepareReplaceWithAccount(): Promise<void> {
  await clearLocalData();
  await AsyncStorage.removeItem('timer:active');
  await clearSharedData();
}

// — DATA BELONGS TO THE ACCOUNT (2026-10-01) —
// The user is never asked a technical question about their data any more:
//   - signing in: local data is uploaded to the account (the 'fresh' path),
//   - signing OUT: once everything is backed up, the device forgets the
//     account's data (forgetAccountOnDevice); signing back in brings it back.
//     So the next sign-in — with ANY account — starts from a clean device and
//     the old "merge or replace?" dialog can't come up.
// The only question left is a real data-loss warning: changes that never
// reached the cloud (pendingChangeCount > 0) at sign-out time.

// How many local changes have NOT reached the cloud yet (synced=0 rows that
// push would send). Purely local, so it's correct offline too: 0 means every
// local change is already in the account's cloud copy.
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

// Sign-out, device side: wipe the account's data from this device (it lives in
// the cloud) and drop the ownership marker, so the next sign-in is a clean
// 'fresh' one. The caller signs out of the session first and has already
// warned about pendingChangeCount().
export async function forgetAccountOnDevice(): Promise<void> {
  await clearLocalData(); // also flushes/stops a running timer (localDataEvents)
  await clearSharedData();
  await AsyncStorage.multiRemove([OWNER_UID_KEY, 'timer:active']);
}

// The device still holds data stamped with ANOTHER account (only possible for
// data left behind by an older version, whose sign-out kept everything). It is
// resolved without asking:
//   - nothing pending  -> every row is safely in that other account's cloud:
//     REPLACE (the device mirrors the account just signed into),
//   - pending changes  -> some rows exist nowhere else (e.g. created offline
//     after an old-style sign-out): MERGE, so not a single one is lost.
export async function resolveAccountSwitch(): Promise<'merge' | 'replace'> {
  if (pendingChangeCount() > 0) {
    await prepareMergeIntoAccount();
    return 'merge';
  }
  await prepareReplaceWithAccount();
  return 'replace';
}

// Completely deletes the local user's DATA (users/the local identity is
// preserved) and resets the pull watermark. Exists for the "REPLACE account"
// semantics: for switching to a different account, wiping local data and
// downloading that account's cloud data from scratch — the opposite of
// prepareFullResync (MERGE: pushes local data up too), which wipes local
// data instead. Must only be called from the "replace" flow; misuse causes data loss.
// FK safety: TABLES is walked in reverse order so child tables are deleted first.
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

// Sends a table's pending (synced=0) rows to the cloud in BATCHES.
// Each batch is marked as soon as its own request succeeds; that way, if a
// batch in the middle fails, the earlier ones stay permanent and a retry only
// sends what's left (see PUSH_PAGE_SIZE).
async function pushTable(cfg: TableCfg, uid: string): Promise<number> {
  const db = getDb();
  let pushed = 0;
  // CURSOR-BASED PAGINATION. It used to load ALL pending rows into memory
  // with a single SELECT and then slice them: the request was batched but
  // memory wasn't. On a full resync (every row synced=0), that meant copying
  // the entirety of habit_logs into the JS heap at once.
  //
  // Why `id > cursor` and not just LIMIT: if a row gets edited during push,
  // its updated_at changes, and marking it does NOT set synced=1 (on purpose)
  // — a plain `WHERE synced = 0 LIMIT n` query would keep reselecting the same
  // row forever. The cursor guarantees progress; that row goes out on the next ROUND instead.
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
    // Markings made before a throw STAY — deliberate: there's no point
    // resending rows that already reached the cloud.
    if (error) throw new Error(`${cfg.table} push: ${error.message}${schemaHint(error.message)}`);

    // Only mark synced=1 the rows that are still exactly as we sent them.
    // If updated_at changed (edited in the meantime), leave it alone; it goes out next round.
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

// Upserts into local storage (a row coming from remote). Writes synced=1 (same state as remote).
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
  // `defaults` only kicks in for columns that are NOT NULL locally (see TableCfg).
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

// Applies a single remote row locally under the last-writer-wins rule.
// Returns true if applied, false if skipped because the local one is newer.
function applyRemoteRow(cfg: TableCfg, r: any, localUserId: string, myUid: string): boolean {
  const db = getDb();
  const derived = cfg.derivePulled ? cfg.derivePulled(r, myUid) : {};
  const mapped = cfg.hasUserId ? { ...r, user_id: localUserId } : r;

  // 1) If the same id exists locally: classic last-writer-wins (local wins on a tie).
  const byId = db.getFirstSync<any>(
    `SELECT updated_at FROM ${cfg.table} WHERE id = ?`,
    [r.id]
  );
  if (byId) {
    if (ts(byId.updated_at) >= ts(r.updated_at)) return false;
    upsertLocal(cfg, mapped, derived);
    return true;
  }

  // 2) The id doesn't exist locally, but the natural key collides: two devices
  // produced the same logical record under different ids. The winner is
  // chosen by updated_at; if remote wins, the local rival row is deleted and the remote one is written.
  //
  // ONLY LIVE ROWS COMPETE (tables with soft delete, i.e. reminders): a
  // tombstone says "THIS id was deleted", not "this time slot is forbidden".
  // Letting tombstones take part lost reminders on the other device: saving a
  // form deletes a reminder and re-creates the same time under a new id, both
  // stamped in the same millisecond. If the tombstone arrived first, it won
  // the tie ("local wins") and the live row was silently skipped — for good,
  // since the watermark moved past it. A device clock running slightly ahead
  // produced the same loss without a tie. So: a remote tombstone never
  // displaces a live row with a different id (it's stored under its own id),
  // and a live remote row never loses to a local tombstone. habit_logs (no
  // soft delete, local UNIQUE) is unaffected.
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

// Pulls remote rows changed since the last sync and applies last-writer-wins.
// Returns the largest updated_at seen (the new watermark).
//
// Pagination is mandatory: if the response gets cut off at 1000 rows and the
// watermark still advances, the cut-off rows are NEVER pulled again (silent
// data loss). Hence the loop runs until all pages are exhausted.
async function pullTable(
  cfg: TableCfg,
  localUserId: string,
  myUid: string,
  since: string
): Promise<{ count: number; maxServerTs: string }> {
  let maxServerTs = since;
  let count = 0;

  for (let from = 0; ; from += PULL_PAGE_SIZE) {
    // id is the secondary sort key so the page boundary stays stable for rows with an equal server timestamp.
    const { data, error } = await supabase!
      .from(cfg.table)
      .select([...cfg.cols, SERVER_TS_COL].join(','))
      .gt(SERVER_TS_COL, since)
      .order(SERVER_TS_COL, { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PULL_PAGE_SIZE - 1);
    // A missing column means a stale schema: supabase/schema.sql needs a rerun (see schemaHint).
    if (error) throw new Error(`${cfg.table} pull: ${error.message}${schemaHint(error.message)}`);

    for (const remote of data ?? []) {
      const r = remote as any;
      if (applyRemoteRow(cfg, r, localUserId, myUid)) count++;
      if (ts(r[SERVER_TS_COL]) > ts(maxServerTs)) maxServerTs = r[SERVER_TS_COL];
    }

    // A page that isn't full = the last page.
    if (!data || data.length < PULL_PAGE_SIZE) break;
  }

  return { count, maxServerTs };
}

// A task shared WITH me simply vanishes from my pull when the share ends
// (unshared, unfriended, owner deleted their account) — no tombstone ever
// arrives. So after each pull, ask which of my local shared-with-me rows are
// still visible and drop the rest. The request is keyed by the LOCAL ids
// (chunked), so it's bounded and needs no pagination; and it's skipped
// entirely when there are none, so users who never share pay nothing.
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

// A full sync round: push everything, then pull everything.
export async function runSync(localUserId: string): Promise<SyncResult> {
  if (!supabase) return { status: 'disabled' };
  if (inFlight) return { status: 'busy', message: 'Senkron zaten sürüyor' };
  inFlight = true;
  try {
    const uid = await ensureSignedIn();
    if (!uid) return { status: 'disabled' };

    // 1) PUSH (parent first)
    let pushed = 0;
    for (const cfg of TABLES) pushed += await pushTable(cfg, uid);

    // 2) PULL (parent first, for FK) — each table advances from its OWN watermark.
    await migrateWatermarks();
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

    // 3) RE-DERIVE goal progress from entries. The current_value coming from
    // remote is a stale cache that doesn't see the other device's entries;
    // applying last-writer-wins to it silently erased this device's
    // contribution. Since entries are synced individually by their own ids,
    // the total now merges without conflict (see migration019 +
    // goalRepo.recomputeAllFromEntries). Must run AFTER pull: it's computed once all remote entries have landed locally.
    goalRepo.recomputeAllFromEntries();

    // From here on, this device's data belongs to this account; an account
    // switch can only be noticed BEFORE the conflict happens because of this flag.
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
