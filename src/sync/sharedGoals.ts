// Shared goals (Phase 4): the friend can VIEW a goal and CONTRIBUTE progress.
// Like sharedHabits.ts this stays OUTSIDE the offline-first sync engine: a
// friend's goal must never land in the local goals table (it would show up as
// the recipient's own goal). Reads come from SECURITY DEFINER RPCs that verify
// the share (supabase/schema.sql, PHASE 4) and are cached in AsyncStorage under
// `shared:*`, which clearSharedData() wipes on sign-out / account switch.
//
// Contributing is ONLINE-ONLY by design: the entry is written server-side onto
// the OWNER's goal (add_shared_goal_entry). Queuing it offline would need a
// second outbox beside the sync engine for rows this device doesn't own — not
// worth it for a single number the user can simply re-enter.
//
// On the owner's side nothing special happens: the friend's entry is an
// ordinary goal_entries row (with added_by set) that arrives through the normal
// pull and merges into current_value (see goalRepo.recomputeAllFromEntries).

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Goal, GoalEntry, GoalMilestone, GoalType } from '../types/models';
import { supabase } from './supabase';
import { SharingError, toSharingError } from './sharingErrors';
import type { Friend } from './friends';

export interface SharedGoal {
  goal: Goal;
  owner: Friend;
  sharedAt: string;
}

export interface SharedGoalDetail {
  goal: Goal;
  owner: Friend;
  milestones: GoalMilestone[];
  // Newest first; added_by is ALWAYS set here (the owner's rows are resolved
  // to the owner's uid server-side).
  entries: GoalEntry[];
  // uid -> display name of everyone who appears in `entries`.
  names: Record<string, string | null>;
}

const LIST_KEY = 'shared:goals:list';
const DETAIL_PREFIX = 'shared:goal:';
const detailKey = (goalId: string) => `${DETAIL_PREFIX}${goalId}`;

function client() {
  if (!supabase) throw new SharingError('ERK_AUTH');
  return supabase;
}

// A remote goal row -> the app's Goal shape. Fields the friend never receives
// (reminders, baseline) get neutral values; current_value is the server's
// fresh total, which already includes every contribution.
function toGoal(row: any): Goal {
  return {
    id: row.id,
    user_id: row.owner_id,
    title: row.title,
    goal_type: (row.goal_type ?? 'numeric') as GoalType,
    target_value: row.target_value ?? null,
    current_value: row.current_value ?? 0,
    value_baseline: 0,
    unit: row.unit ?? null,
    deadline: row.deadline ?? null,
    completed_at: row.completed_at ?? null,
    remind_at: null,
    start_date: row.start_date ?? null,
    updated_at: row.shared_at ?? new Date(0).toISOString(),
    deleted_at: null,
    synced: 1,
  };
}

function toOwner(row: any): Friend {
  return {
    id: row.owner_id,
    displayName: row.owner_name ?? null,
    avatarUrl: row.owner_avatar ?? null,
    connectedAt: null,
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

export async function shareGoal(goalId: string, friendId: string): Promise<void> {
  try {
    const { data, error } = await client().rpc('share_goal', { p_goal_id: goalId, p_friend: friendId });
    if (error) throw error;
    if (data?.error) throw new SharingError(toSharingError(data.error).code);
  } catch (e) {
    throw toSharingError(e);
  }
}

export async function unshareGoal(goalId: string, friendId: string): Promise<void> {
  try {
    const { error } = await client().rpc('unshare_goal', { p_goal_id: goalId, p_friend: friendId });
    if (error) throw error;
  } catch (e) {
    throw toSharingError(e);
  }
}

// Friends this goal is shared with (RLS limits rows to owner/recipient).
export async function listGoalShares(goalId: string): Promise<string[]> {
  try {
    const { data, error } = await client()
      .from('goal_shares')
      .select('shared_with_id')
      .eq('goal_id', goalId);
    if (error) throw error;
    return (data ?? []).map((r: any) => r.shared_with_id as string);
  } catch (e) {
    throw toSharingError(e);
  }
}

// ------------------------------------------------------------ recipient side

export async function getCachedSharedGoals(): Promise<SharedGoal[]> {
  const list = await readJson<SharedGoal[]>(LIST_KEY);
  return Array.isArray(list) ? list : [];
}

export async function getSharedGoals(): Promise<SharedGoal[]> {
  let list: SharedGoal[];
  try {
    const { data, error } = await client().rpc('get_shared_goals');
    if (error) throw error;
    list = (data ?? []).map((row: any) => ({ goal: toGoal(row), owner: toOwner(row), sharedAt: row.shared_at }));
  } catch (e) {
    throw toSharingError(e);
  }
  await writeJson(LIST_KEY, list);
  // Details of goals no longer shared with us must not linger on the device.
  try {
    const live = new Set(list.map((s) => s.goal.id));
    const stale = (await AsyncStorage.getAllKeys()).filter(
      (k) => k.startsWith(DETAIL_PREFIX) && !live.has(k.slice(DETAIL_PREFIX.length))
    );
    if (stale.length > 0) await AsyncStorage.multiRemove(stale);
  } catch {
    // Housekeeping only.
  }
  return list;
}

// Exported for tests: the RPC's jsonb -> SharedGoalDetail.
export function parseGoalDetail(goalId: string, data: any): SharedGoalDetail {
  const g = data?.goal ?? {};
  const goal = toGoal({ ...g, id: g.id ?? goalId });
  const milestones: GoalMilestone[] = (data?.milestones ?? []).map((m: any) => ({
    id: m.id,
    goal_id: goalId,
    title: m.title,
    completed: m.completed === 1 ? 1 : 0,
    position: m.position ?? 0,
    amount: m.amount ?? null,
    due_date: m.due_date ?? null,
    updated_at: m.updated_at ?? goal.updated_at,
    deleted_at: null,
    synced: 1,
  }));
  const names: Record<string, string | null> = {};
  const entries: GoalEntry[] = (data?.entries ?? []).map((e: any) => {
    if (e.added_by) names[e.added_by] = e.added_by_name ?? names[e.added_by] ?? null;
    return {
      id: e.id,
      goal_id: goalId,
      amount: Number(e.amount) || 0,
      updated_at: e.updated_at,
      deleted_at: null,
      synced: 1,
      added_by: e.added_by ?? null,
    };
  });
  return { goal, owner: toOwner(g), milestones, entries, names };
}

export async function getCachedSharedGoalDetail(goalId: string): Promise<SharedGoalDetail | null> {
  return readJson<SharedGoalDetail>(detailKey(goalId));
}

export async function getSharedGoalDetail(goalId: string): Promise<SharedGoalDetail> {
  let detail: SharedGoalDetail;
  try {
    const { data, error } = await client().rpc('get_shared_goal_detail', { p_goal_id: goalId });
    if (error) throw error;
    detail = parseGoalDetail(goalId, data);
  } catch (e) {
    throw toSharingError(e);
  }
  await writeJson(detailKey(goalId), detail);
  return detail;
}

// Adds progress to a goal shared with me. A negative amount is a correction
// and the server only lets it undo MY OWN contributions (ERK_CORRECTION_LIMIT).
// Returns the amount actually applied and the goal's new total.
export async function addSharedGoalEntry(
  goalId: string,
  amount: number
): Promise<{ applied: number; currentValue: number }> {
  if (!Number.isFinite(amount) || amount === 0) throw new SharingError('ERK_INVALID_AMOUNT');
  try {
    const { data, error } = await client().rpc('add_shared_goal_entry', {
      p_goal_id: goalId,
      p_amount: amount,
    });
    if (error) throw error;
    if (data?.error) throw new SharingError(toSharingError(data.error).code);
    if (data?.applied == null) throw new SharingError('ERK_UNKNOWN', 'empty contribution result');
    return { applied: Number(data.applied), currentValue: Number(data.current_value) };
  } catch (e) {
    throw toSharingError(e);
  }
}
