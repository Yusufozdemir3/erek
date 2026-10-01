// Friend connections via invite code. Deliberately NOT part of the offline-first
// sync engine (syncEngine.TABLES): inviting/redeeming is inherently an online
// action, and friends' data never belongs in the local SQLite database. Every
// call is a SECURITY DEFINER RPC that validates the caller server-side (see the
// FRIENDS / SHARING section of supabase/schema.sql).
//
// The friend list is cached in AsyncStorage for name badges and offline
// display. The cache (and any other sharing cache, `shared:*`) holds OTHER
// people's data, so it's wiped on sign-out, account deletion and account switch.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { taskRepo } from '../db/repositories/taskRepo';
import { supabase } from './supabase';
import { SharingError, toSharingError } from './sharingErrors';

export interface Friend {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  connectedAt: string | null;
}

export interface Invite {
  code: string;
  expiresAt: string;
}

export const INVITE_CODE_LENGTH = 8;
const FRIENDS_CACHE_KEY = 'friends:cache';
const SHARED_CACHE_PREFIX = 'shared:';

// Same normalization the server applies: letters/digits only, upper case.
export function normalizeInviteCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, INVITE_CODE_LENGTH);
}

function client() {
  if (!supabase) throw new SharingError('ERK_AUTH');
  return supabase;
}

function toFriend(row: any): Friend {
  return {
    id: row.id,
    displayName: row.display_name ?? null,
    avatarUrl: row.avatar_url ?? null,
    connectedAt: row.connected_at ?? null,
  };
}

export async function getInvite(rotate = false): Promise<Invite> {
  try {
    const { data, error } = await client().rpc('get_or_create_invite', { p_rotate: rotate });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.code) throw new SharingError('ERK_UNKNOWN', 'empty invite');
    return { code: row.code, expiresAt: row.expires_at };
  } catch (e) {
    throw toSharingError(e);
  }
}

export async function redeemInvite(code: string): Promise<Friend> {
  try {
    const { data, error } = await client().rpc('redeem_invite', { p_code: normalizeInviteCode(code) });
    if (error) throw error;
    if (data?.error) throw new SharingError(toSharingError(data.error).code);
    if (!data?.friend?.id) throw new SharingError('ERK_UNKNOWN', 'empty friend');
    return toFriend(data.friend);
  } catch (e) {
    throw toSharingError(e);
  }
}

export async function listConnections(): Promise<Friend[]> {
  let friends: Friend[];
  try {
    const { data, error } = await client().rpc('list_connections');
    if (error) throw error;
    friends = (data ?? []).map(toFriend);
  } catch (e) {
    throw toSharingError(e);
  }
  await AsyncStorage.setItem(FRIENDS_CACHE_KEY, JSON.stringify(friends)).catch(() => {});
  return friends;
}

export async function removeConnection(friendId: string): Promise<void> {
  try {
    const { error } = await client().rpc('remove_connection', { p_friend: friendId });
    if (error) throw error;
  } catch (e) {
    throw toSharingError(e);
  }
  const cached = await getCachedFriends();
  await AsyncStorage.setItem(
    FRIENDS_CACHE_KEY,
    JSON.stringify(cached.filter((f) => f.id !== friendId))
  ).catch(() => {});
}

export async function getCachedFriends(): Promise<Friend[]> {
  try {
    const raw = await AsyncStorage.getItem(FRIENDS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Wipes other people's data from the device: tasks shared with me plus every
// friends/sharing cache. Called on sign-out, account deletion and account switch.
export async function clearSharedData(): Promise<void> {
  try {
    taskRepo.purgeSharedWithMe();
  } catch (e) {
    console.warn('[Friends] Failed to purge tasks shared with this user:', e);
  }
  try {
    const keys = await AsyncStorage.getAllKeys();
    const doomed = keys.filter((k) => k === FRIENDS_CACHE_KEY || k.startsWith(SHARED_CACHE_PREFIX));
    if (doomed.length > 0) await AsyncStorage.multiRemove(doomed);
  } catch (e) {
    console.warn('[Friends] Failed to clear sharing caches:', e);
  }
}
