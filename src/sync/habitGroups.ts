// Shared habits ("ortak alışkanlık", schema.sql PHASE 12). Joining a friend's
// shared habit makes the server open a COPY of it in the joiner's account; it
// reaches the device through the normal sync pull and is an ordinary habit
// there. The copies are tied together in a group whose id is the founder's
// habit id. Everyone writes only their own rows, so the sync engine is untouched.
//
// The group list and the other members' logs (never our own: those are in the
// local DB) are cached under `shared:groups` (wiped by clearSharedData()).
// Logs download once and then incrementally past a keyset cursor, rewound by
// SAFETY_MS like the sync watermark; when the set of followed habits changes
// (someone joined or left) the cursor restarts so a newcomer's history arrives.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { SharingError, toSharingError } from './sharingErrors';
import { ensureNicknames, named } from './nicknames';
import { parseJson } from '../lib/helpers';
import { mergeLogRows } from './sharedHabits';

export interface HabitGroupMember {
  id: string;          // cloud uid
  habitId: string;     // this member's copy (the founder's: the group id)
  isOwner: boolean;
  isMe: boolean;
  joinedAt: string;    // ISO; the founder's is the group's start
  displayName: string | null;
  avatarUrl: string | null;
  skipDates: string[]; // rest days: that member doesn't count on them
}

export interface HabitGroup {
  groupId: string;     // the founder's habit id
  members: HabitGroupMember[]; // founder first, then by join time
}

// habitId -> log_date -> completed, for the other members only.
export type GroupLogs = Record<string, Record<string, boolean>>;

export interface HabitGroupsSnapshot {
  groups: HabitGroup[];
  logs: GroupLogs;
}

export const EMPTY_GROUPS: HabitGroupsSnapshot = { groups: [], logs: {} };

const CACHE_KEY = 'shared:groups';
const PAGE_SIZE = 2000; // must match the LIMIT in get_habit_group_logs
const SAFETY_MS = 5_000;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

// Compact on-disk row: [log_date, completed, amount, updatedAtMs].
type CachedRow = [string, 0 | 1, number, number];
interface GroupCache {
  v: 1;
  groups: HabitGroup[];
  rows: Record<string, CachedRow[]>;
  tracked: string; // sorted followed habit ids; a change restarts the cursor
  cursorTs: string | null;
  cursorId: string;
}

function client() {
  if (!supabase) throw new SharingError('ERK_AUTH');
  return supabase;
}

async function readCache(): Promise<GroupCache | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as GroupCache) : null;
    return parsed?.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function toMember(row: any): HabitGroupMember {
  const skip = parseJson<string[]>(row.skip_dates ?? null);
  return {
    id: row.id,
    habitId: row.habit_id,
    isOwner: row.is_owner === true,
    isMe: row.is_me === true,
    joinedAt: row.joined_at,
    displayName: row.name ?? null,
    avatarUrl: row.avatar ?? null,
    skipDates: Array.isArray(skip) ? skip : [],
  };
}

// Exported for tests.
export function toGroups(data: unknown): HabitGroup[] {
  if (!Array.isArray(data)) return [];
  return data.map((g: any) => ({
    groupId: g.group_id,
    members: Array.isArray(g.members) ? g.members.map(toMember) : [],
  }));
}

function trackedKey(groups: HabitGroup[]): string {
  const ids = new Set<string>();
  for (const g of groups) for (const m of g.members) if (!m.isMe) ids.add(m.habitId);
  return [...ids].sort().join(',');
}

function toSnapshot(cache: GroupCache): HabitGroupsSnapshot {
  const logs: GroupLogs = {};
  for (const [habitId, rows] of Object.entries(cache.rows)) {
    const days: Record<string, boolean> = {};
    for (const [date, completed] of rows) days[date] = completed === 1;
    logs[habitId] = days;
  }
  const groups = cache.groups.map((g) => ({
    ...g,
    members: g.members.map((m) => (m.isMe ? m : named(m))),
  }));
  return { groups, logs };
}

export async function getCachedHabitGroups(): Promise<HabitGroupsSnapshot> {
  const cache = await readCache();
  if (!cache) return EMPTY_GROUPS;
  await ensureNicknames();
  return toSnapshot(cache);
}

// The group list, then the other members' logs since the cursor.
export async function refreshHabitGroups(): Promise<HabitGroupsSnapshot> {
  const prev = await readCache();
  let groups: HabitGroup[];
  try {
    const { data, error } = await client().rpc('get_my_habit_groups');
    if (error) throw error;
    groups = toGroups(data);
  } catch (e) {
    throw toSharingError(e);
  }

  const tracked = trackedKey(groups);
  const keep = new Set(tracked ? tracked.split(',') : []);
  const restart = !prev || prev.tracked !== tracked;
  const byHabit = new Map<string, Map<string, CachedRow>>();
  if (prev && !restart) {
    for (const [habitId, rows] of Object.entries(prev.rows)) {
      if (keep.has(habitId)) byHabit.set(habitId, new Map(rows.map((r) => [r[0], r])));
    }
  }

  let afterTs = restart ? null : prev!.cursorTs;
  let afterId = restart ? ZERO_UUID : prev!.cursorId;
  let lastSeenTs: string | null = null;
  if (keep.size > 0) {
    try {
      for (;;) {
        const { data, error } = await client().rpc('get_habit_group_logs', {
          p_after_ts: afterTs ?? '-infinity',
          p_after_id: afterId,
        });
        if (error) throw error;
        const page = (data ?? []) as any[];
        for (const r of page) {
          if (!keep.has(r.habit_id)) continue;
          let days = byHabit.get(r.habit_id);
          if (!days) byHabit.set(r.habit_id, (days = new Map()));
          mergeLogRows(days, [r]);
        }
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
  }

  const rows: Record<string, CachedRow[]> = {};
  for (const [habitId, days] of byHabit) rows[habitId] = [...days.values()];
  const next: GroupCache = {
    v: 1,
    groups,
    rows,
    tracked,
    cursorTs:
      lastSeenTs != null
        ? new Date(Date.parse(lastSeenTs) - SAFETY_MS).toISOString()
        : restart
          ? null
          : prev!.cursorTs,
    cursorId: ZERO_UUID,
  };
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {});
  await ensureNicknames();
  return toSnapshot(next);
}

// Joins a friend's shared habit; returns the id of our new copy (it arrives
// with the next sync pull). `today` is the device's "YYYY-MM-DD": the copy starts then.
export async function joinHabitGroup(habitId: string, today: string): Promise<string> {
  try {
    const { data, error } = await client().rpc('join_habit_group', { p_habit_id: habitId, p_today: today });
    if (error) throw error;
    if (data?.error) throw new SharingError(toSharingError(data.error).code);
    return data.habit_id as string;
  } catch (e) {
    throw toSharingError(e);
  }
}

// A member leaves with their copy's id; the founder ends the group with theirs.
// Every copy stays with its owner as an ordinary habit.
export async function leaveHabitGroup(habitId: string): Promise<void> {
  try {
    const { error } = await client().rpc('leave_habit_group', { p_habit_id: habitId });
    if (error) throw error;
  } catch (e) {
    throw toSharingError(e);
  }
}
