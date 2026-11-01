// Read-only habit sharing (schema.sql PHASE 2). Kept out of the sync engine — a
// friend's habit must never land in the local habits table. Data comes from
// share-checking RPCs, cached under `shared:*` (wiped by clearSharedData()).
//
// A habit's history downloads once; later opens fetch only rows past a keyset
// cursor (server_updated_at, id), rewound by SAFETY_MS like the sync
// watermark. Merging is last-writer-wins by log_date, so re-reads are
// harmless. At most MAX_CACHED_HABITS histories are kept (LRU).

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Habit, HabitKind, HabitLog, Recurrence } from '../types/models';
import { parseJson } from '../lib/helpers';
import { supabase } from './supabase';
import { SharingError, toSharingError } from './sharingErrors';
import { ensureNicknames, named } from './nicknames';
import type { Friend } from './friends';

export interface SharedHabit {
  habit: Habit;
  owner: Friend;
  sharedAt: string;
  // false = shared "just to watch": joining is closed. Old caches lack it (= true).
  together?: boolean;
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
      unarchived_at: null,
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
    together: row.together !== false,
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

// "Just watch" (false) or "do it together" (true) for every share of this habit.
export async function setHabitShareMode(habitId: string, together: boolean): Promise<void> {
  try {
    const { error } = await client().rpc('set_habit_share_mode', { p_habit_id: habitId, p_together: together });
    if (error) throw error;
  } catch (e) {
    throw toSharingError(e);
  }
}

// The mode of this habit's shares; null when it isn't shared with anyone.
export async function getHabitShareMode(habitId: string): Promise<boolean | null> {
  try {
    const { data, error } = await client().from('habit_shares').select('together').eq('habit_id', habitId);
    if (error) throw error;
    if (!data || data.length === 0) return null;
    return data.some((r: any) => r.together !== false);
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

// Nicknames are applied on the way out; the cache keeps the friend's real name.
function withNicknames(list: SharedHabit[]): SharedHabit[] {
  return list.map((s) => ({ ...s, owner: named(s.owner) }));
}

export async function getCachedSharedHabits(): Promise<SharedHabit[]> {
  const list = await readJson<SharedHabit[]>(LIST_KEY);
  await ensureNicknames();
  return Array.isArray(list) ? withNicknames(list) : [];
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
  await ensureNicknames();
  return withNicknames(list);
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
