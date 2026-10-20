// Friend nicknames: how the user chooses to see a friend, whatever username the
// friend picked. Kept in the user's own cloud table (friend_nicknames, RLS:
// own rows only) so they survive sign-out and a new phone, and cached locally
// for offline use. Nothing here is ever shown to the friend.
//
// The sharing caches keep the friend's REAL name; a nickname is applied when
// they are read (named / nameFor), so changing one needs no cache rewrite.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const CACHE_KEY = 'nicknames:v1';
export const NICKNAME_MAX = 30;

export interface NamedFriend {
  id: string;
  displayName: string | null;
  // The friend's own username; set only when a nickname replaces displayName.
  originalName?: string | null;
}

let nicknames = new Map<string, string>();
let hydrated = false;

async function hydrate(): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      nicknames = new Map(Object.entries(parsed as Record<string, string>).filter(([, v]) => typeof v === 'string'));
    }
  } catch {
    // start empty
  }
  hydrated = true;
}

async function persist(): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(nicknames))).catch(() => {});
}

// Cache first (cheap), safe to call before every read.
export async function ensureNicknames(): Promise<void> {
  await hydrate();
}

// Pulls the account's nicknames; on any failure the cached ones stay.
export async function refreshNicknames(): Promise<void> {
  await hydrate();
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('friend_nicknames').select('friend_id, nickname');
    if (error || !data) return;
    nicknames = new Map((data as { friend_id: string; nickname: string }[]).map((r) => [r.friend_id, r.nickname]));
    await persist();
  } catch {
    // keep the cache
  }
}

export function nicknameOf(friendId: string): string | null {
  return nicknames.get(friendId) ?? null;
}

// The name to show for `uid`: nickname, else the friend's own name.
export function nameFor(uid: string, realName: string | null): string | null {
  return nicknames.get(uid) ?? realName;
}

// Same friend with the nickname applied (unchanged object when there is none).
export function named<T extends NamedFriend>(friend: T): T {
  const nick = nicknames.get(friend.id);
  if (!nick) return friend;
  return { ...friend, displayName: nick, originalName: friend.originalName ?? friend.displayName };
}

// Sets (or, with an empty string, clears) a nickname. Returns false when it
// could not be saved; the local view is only changed on success.
export async function setNickname(friendId: string, nickname: string): Promise<boolean> {
  await hydrate();
  const value = nickname.trim().slice(0, NICKNAME_MAX);
  if (!supabase) return false;
  try {
    if (value) {
      const { error } = await supabase
        .from('friend_nicknames')
        .upsert({ friend_id: friendId, nickname: value }, { onConflict: 'user_id,friend_id' });
      if (error) return false;
      nicknames.set(friendId, value);
    } else {
      const { error } = await supabase.from('friend_nicknames').delete().eq('friend_id', friendId);
      if (error) return false;
      nicknames.delete(friendId);
    }
    await persist();
    return true;
  } catch {
    return false;
  }
}

// Sign-out / account switch: they belong to the account.
export async function clearNicknames(): Promise<void> {
  nicknames = new Map();
  hydrated = true;
  await AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
}
