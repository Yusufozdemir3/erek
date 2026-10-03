// Server side of this device's push token (friend nudges; see schema.sql
// PHASE 5). The token itself comes from lib/pushRegistration.ts; this module
// remembers what was registered and keeps the server in step with the session:
//
// - register under the signed-in account (re-registering moves the token
//   server-side, so another person signing in on this phone takes it over);
// - release on sign-out, BEFORE the session goes away;
// - if that release can't reach the server (offline sign-out), keep the token
//   as "pending" and retry by token alone — no session needed — so the old
//   account's nudges stop reaching this phone as soon as it's back online.
//
// No expo-notifications import here on purpose: auth.ts depends on this file
// and runs in the Node test project.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lang } from '@/i18n/translations';
import { setNudgeRecipientUid } from '@/lib/nudgeRecipient';
import { supabase } from './supabase';

const REGISTERED_KEY = 'push:registered'; // JSON Registered
const PENDING_KEY = 'push:pendingRelease'; // a token still to be released
// Re-registering now and then refreshes updated_at server-side (the newest 10
// tokens per account are kept) and repairs a registration lost server-side.
const REFRESH_MS = 7 * 24 * 3600 * 1000;
const RELEASE_TIMEOUT_MS = 5000;

interface Registered {
  token: string;
  uid: string;
  lang: Lang;
  at: number;
}

async function readRegistered(): Promise<Registered | null> {
  try {
    const raw = await AsyncStorage.getItem(REGISTERED_KEY);
    return raw ? (JSON.parse(raw) as Registered) : null;
  } catch {
    return null;
  }
}

async function tryRelease(token: string): Promise<boolean> {
  if (!supabase) return false;
  const client = supabase;
  try {
    const call = Promise.resolve(client.rpc('release_push_token', { p_token: token }));
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), RELEASE_TIMEOUT_MS));
    const { error } = await Promise.race([call, timeout]);
    return !error;
  } catch {
    return false;
  }
}

export async function registerPushToken(token: string, uid: string, lang: Lang, now: number = Date.now()): Promise<void> {
  setNudgeRecipientUid(uid);
  if (!supabase) return;
  const prev = await readRegistered();
  if (prev && prev.token === token && prev.uid === uid && prev.lang === lang && now - prev.at < REFRESH_MS) return;
  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_locale: lang });
  if (error) return; // tried again on the next foreground
  await AsyncStorage.setItem(REGISTERED_KEY, JSON.stringify({ token, uid, lang, at: now } satisfies Registered));
  // The same phone token, now registered (moved) to this account: releasing
  // it later would cut THIS account off.
  if ((await AsyncStorage.getItem(PENDING_KEY)) === token) await AsyncStorage.removeItem(PENDING_KEY);
}

// The device can't show notifications any more (permission revoked): stop
// receiving, but stay the recipient for anything already on screen.
export async function unregisterPushToken(): Promise<void> {
  const prev = await readRegistered();
  if (!prev) return;
  if (await tryRelease(prev.token)) await AsyncStorage.removeItem(REGISTERED_KEY);
}

// Sign-out. Must run while the session still exists.
export async function releasePushTokenForSignOut(): Promise<void> {
  setNudgeRecipientUid(null);
  const prev = await readRegistered();
  await AsyncStorage.removeItem(REGISTERED_KEY);
  if (!prev) return;
  if (!(await tryRelease(prev.token))) await AsyncStorage.setItem(PENDING_KEY, prev.token);
}

// On every start/foreground: finish a release an offline sign-out left behind.
export async function retryPendingRelease(): Promise<void> {
  const token = await AsyncStorage.getItem(PENDING_KEY);
  if (token && (await tryRelease(token))) await AsyncStorage.removeItem(PENDING_KEY);
}

// After account deletion: the server already dropped the token (cascade).
export async function forgetPushToken(): Promise<void> {
  setNudgeRecipientUid(null);
  await AsyncStorage.multiRemove([REGISTERED_KEY, PENDING_KEY]);
}
