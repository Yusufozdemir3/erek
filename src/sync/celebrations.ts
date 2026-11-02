// Finished shared items and congratulations, client side. Both go through the
// send-nudge Edge Function (never straight to a push service); the server
// re-checks everything (PHASE 7 in supabase/schema.sql). Online-only.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { goalRepo, habitRepo } from '@/db';
import {
  congratsOutcome,
  finishedCandidates,
  finishedSettled,
  type CelebrationKind,
  type CongratsOutcome,
} from '@/lib/celebrations';
import { todayDate } from '@/lib/helpers';
import { supabase } from './supabase';

// The last answer (or why there was none), so a failed congratulation can tell
// the user WHAT failed instead of a bare "couldn't send".
let lastStatus = 'none';
export function lastCelebrationStatus(): string {
  return lastStatus;
}

async function call(body: Record<string, unknown>): Promise<unknown> {
  if (!supabase) {
    lastStatus = 'offline';
    return undefined;
  }
  try {
    const { data, error } = await supabase.functions.invoke('send-nudge', { body });
    if (error) {
      const res = (error as { context?: Response }).context;
      const parsed = await res?.json?.().catch(() => null);
      lastStatus = typeof parsed?.status === 'string' ? parsed.status : res?.status ? `http_${res.status}` : 'network';
      return parsed?.status;
    }
    const status = (data as { status?: unknown } | null)?.status;
    lastStatus = typeof status === 'string' ? status : 'empty';
    return status;
  } catch {
    lastStatus = 'network';
    return undefined;
  }
}

// A friend congratulates the owner of a finished shared goal / habit / task.
export async function sendCongrats(kind: CelebrationKind, itemId: string): Promise<CongratsOutcome> {
  return congratsOutcome(await call({ action: 'congrats', kind, itemId }));
}

// The owner invites the friends a habit is shared with "to do together" (the server sends one
// push per friend, once). Fire-and-forget: the invite also shows in their shared list.
export async function sendHabitInvite(habitId: string): Promise<void> {
  await call({ action: 'invite', kind: 'habit', itemId: habitId });
}

// I was the last of my group to mark `day`: tell the others. The server checks that everyone did.
export async function sendGroupDone(habitId: string, day: string): Promise<void> {
  await call({ action: 'group_done', kind: 'habit', itemId: habitId, day });
}

// v2: an earlier build could record items as announced after a refused request.
const ANNOUNCED_KEY = 'celebrations:announced:v2';
const KEEP = 200;

async function readAnnounced(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(ANNOUNCED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function localCandidates(userId: string) {
  return finishedCandidates(goalRepo.listByUser(userId), habitRepo.listByUser(userId), todayDate());
}

// Is there a recently finished goal/habit whose people haven't been told yet?
// The app asks this after a data change: a finished shared item must reach the
// server (a sync) before they can be notified, and syncs otherwise only happen
// at launch / foreground, so this is what makes the notice prompt.
export async function hasPendingFinished(userId: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const candidates = localCandidates(userId);
    if (candidates.length === 0) return false;
    const done = new Set(await readAnnounced());
    return candidates.some((c) => !done.has(c.key));
  } catch {
    return false;
  }
}

let running = false;

// After a successful sync (the server must know the item is finished): tells
// the people my recently finished goals / habits are shared with. The server
// decides who (shares, mutes, opt-out) and announces each item only once; this
// just remembers locally which ones it has already asked about, so most syncs
// make no request at all.
export async function announceFinishedShares(userId: string): Promise<void> {
  if (!supabase || running) return;
  running = true;
  try {
    const candidates = localCandidates(userId);
    if (candidates.length === 0) return;
    const done = new Set(await readAnnounced());
    let changed = false;
    for (const c of candidates) {
      if (done.has(c.key)) continue;
      const status = await call({ action: 'finished', kind: c.kind, itemId: c.id });
      if (finishedSettled(status)) {
        done.add(c.key);
        changed = true;
      }
    }
    if (changed) await AsyncStorage.setItem(ANNOUNCED_KEY, JSON.stringify([...done].slice(-KEEP))).catch(() => {});
  } catch {
    // Best effort: the next sync tries again.
  } finally {
    running = false;
  }
}
