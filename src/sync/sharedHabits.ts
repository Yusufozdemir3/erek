// Read-only habit sharing (Phase 2). Like friends.ts this stays OUTSIDE the
// offline-first sync engine: a friend's habit must never land in the local
// habits table (it would show up as the recipient's own habit). Data comes
// from SECURITY DEFINER RPCs that verify the share (supabase/schema.sql,
// PHASE 2) and is cached in AsyncStorage under `shared:*`, which
// clearSharedData() wipes on sign-out / account switch.
//
// PERFORMANCE: a habit's full history is downloaded ONCE; after that each
// open fetches only rows changed since the stored keyset cursor
// (server_updated_at, id). The cursor is rewound by a safety margin between
// sessions for the same reason as the sync engine's WATERMARK_SAFETY_MS
// (now() is transaction-start time, so commits can land out of order);
// re-reading a few rows is harmless because merging is last-writer-wins by
// log_date. At most MAX_CACHED_HABITS histories are kept (LRU).

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Habit, HabitKind, HabitLog, Recurrence } from '../types/models';
import { parseJson } from '../lib/helpers';
import { supabase } from './supabase';
import { SharingError, toSharingError } from './sharingErrors';
import type { Friend } from './friends';

export interface SharedHabit {
  habit: Habit;
  owner: Friend;
  sharedAt: string;
}

const LIST_KEY = 'shared:habits:list';
const LRU_KEY = 'shared:habits:lru';
const logsKey = (habitId: string) => `shared:habit:${habitId}`;
const MAX_CACHED_HABITS = 20;
const PAGE_SIZE = 2000; // must match the LIMIT in get_shared_habit_logs
const SAFETY_MS = 5_000;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

// Compact on-disk row: [log_date, completed, amount, updatedAtMs].
type CachedRow = [string, 0 | 1, number, number];
interface LogCache {
  v: 1;
  rows: CachedRow[];
  cursorTs: string | null;
  cursorId: string;
}

function client() {
  if (!supabase) throw new SharingError('ERK_AUTH');
  return supabase;
}

function toSharedHabit(row: any): SharedHabit {
  return {
    habit: {
      id: row.id,
      user_id: row.owner_id,
      goal_id: null,
      title: row.title,
      kind: (row.kind ?? 'binary') as HabitKind,
      remind_at: null,
      icon: row.icon ?? null,
      color: row.color ?? null,
      schedule: parseJson<Recurrence>(row.schedule ?? null),
      target_amount: row.target_amount ?? null,
      unit: row.unit ?? null,
      start_date: row.start_date ?? null,
      end_date: row.end_date ?? null,
      goal_contribution: null,
      goal_factor: 1,
      updated_at: row.shared_at,
      deleted_at: null,
      synced: 1,
    },
    owner: {
      id: row.owner_id,
      displayName: row.owner_name ?? null,
      avatarUrl: row.owner_avatar ?? null,
      connectedAt: null,
    },
    sharedAt: row.shared_at,
  };
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
}

// ---------------------------------------------------------------- owner side

export async function shareHabit(habitId: string, friendId: string): Promise<void> {
  try {
    const { data, error } = await client().rpc('share_habit', { p_habit_id: habitId, p_friend: friendId });
    if (error) throw error;
    if (data?.error) throw new SharingError(toSharingError(data.error).code);
  } catch (e) {
    throw toSharingError(e);
  }
}

export async function unshareHabit(habitId: string, friendId: string): Promise<void> {
  try {
    const { error } = await client().rpc('unshare_habit', { p_habit_id: habitId, p_friend: friendId });
    if (error) throw error;
  } catch (e) {
    throw toSharingError(e);
  }
}

// Friends this habit is shared with (RLS limits rows to owner/recipient).
export async function listHabitShares(habitId: string): Promise<string[]> {
  try {
    const { data, error } = await client()
      .from('habit_shares')
      .select('shared_with_id')
      .eq('habit_id', habitId);
    if (error) throw error;
    return (data ?? []).map((r: any) => r.shared_with_id as string);
  } catch (e) {
    throw toSharingError(e);
  }
}

// ------------------------------------------------------------ recipient side

export async function getCachedSharedHabits(): Promise<SharedHabit[]> {
  const list = await readJson<SharedHabit[]>(LIST_KEY);
  return Array.isArray(list) ? list : [];
}

export async function getSharedHabits(): Promise<SharedHabit[]> {
  let list: SharedHabit[];
  try {
    const { data, error } = await client().rpc('get_shared_habits');
    if (error) throw error;
    list = (data ?? []).map(toSharedHabit);
  } catch (e) {
    throw toSharingError(e);
  }
  await writeJson(LIST_KEY, list);
  // Histories of habits no longer shared with us must not linger on the device.
  const live = new Set(list.map((s) => s.habit.id));
  const lru = (await readJson<string[]>(LRU_KEY)) ?? [];
  const stale = lru.filter((id) => !live.has(id));
  if (stale.length > 0) {
    await AsyncStorage.multiRemove(stale.map(logsKey)).catch(() => {});
    await writeJson(LRU_KEY, lru.filter((id) => live.has(id)));
  }
  return list;
}

function rowsToLogs(habitId: string, rows: CachedRow[]): HabitLog[] {
  return rows
    .map(([date, completed, amount, updatedMs]) => ({
      id: `${habitId}:${date}`,
      habit_id: habitId,
      log_date: date,
      completed,
      amount,
      updated_at: new Date(updatedMs).toISOString(),
    }))
    .sort((a, b) => (a.log_date < b.log_date ? -1 : a.log_date > b.log_date ? 1 : 0));
}

export async function getCachedSharedHabitLogs(habitId: string): Promise<HabitLog[] | null> {
  const cache = await readJson<LogCache>(logsKey(habitId));
  return cache?.v === 1 ? rowsToLogs(habitId, cache.rows) : null;
}

async function touchLru(habitId: string): Promise<void> {
  const lru = ((await readJson<string[]>(LRU_KEY)) ?? []).filter((id) => id !== habitId);
  lru.unshift(habitId);
  const evicted = lru.splice(MAX_CACHED_HABITS);
  if (evicted.length > 0) await AsyncStorage.multiRemove(evicted.map(logsKey)).catch(() => {});
  await writeJson(LRU_KEY, lru);
}

// Exported for tests: last-writer-wins merge by log_date (the cloud can hold
// two rows for one date when two devices logged it before syncing).
export function mergeLogRows(
  existing: Map<string, CachedRow>,
  incoming: { log_date: string; completed: number; amount: number | null; updated_at: string }[]
): void {
  for (const r of incoming) {
    const updatedMs = Date.parse(r.updated_at) || 0;
    const prev = existing.get(r.log_date);
    if (prev && prev[3] > updatedMs) continue;
    existing.set(r.log_date, [r.log_date, r.completed === 1 ? 1 : 0, r.amount ?? 0, updatedMs]);
  }
}

export async function syncSharedHabitLogs(habitId: string): Promise<HabitLog[]> {
  const cache = await readJson<LogCache>(logsKey(habitId));
  const byDate = new Map<string, CachedRow>(
    cache?.v === 1 ? cache.rows.map((r) => [r[0], r] as [string, CachedRow]) : []
  );
  let afterTs = cache?.v === 1 ? cache.cursorTs : null;
  let afterId = cache?.v === 1 ? cache.cursorId : ZERO_UUID;
  let lastSeenTs: string | null = null;

  try {
    for (;;) {
      const { data, error } = await client().rpc('get_shared_habit_logs', {
        p_habit_id: habitId,
        p_after_ts: afterTs ?? '-infinity',
        p_after_id: afterId,
      });
      if (error) throw error;
      const page = (data ?? []) as any[];
      mergeLogRows(byDate, page);
      if (page.length > 0) {
        const last = page[page.length - 1];
        lastSeenTs = last.server_updated_at;
        afterTs = last.server_updated_at;
        afterId = last.id;
      }
      if (page.length < PAGE_SIZE) break;
    }
  } catch (e) {
    throw toSharingError(e);
  }

  const rows = [...byDate.values()];
  const next: LogCache = {
    v: 1,
    rows,
    cursorTs:
      lastSeenTs != null
        ? new Date(Date.parse(lastSeenTs) - SAFETY_MS).toISOString()
        : cache?.v === 1
          ? cache.cursorTs
          : null,
    cursorId: ZERO_UUID,
  };
  await writeJson(logsKey(habitId), next);
  await touchLru(habitId);
  return rowsToLogs(habitId, rows);
}
