// Sync identity. THE ONE RULE: data leaves the device ONLY if the user
// knowingly signed into an account; without one, sync is off and the app is
// entirely local. The uid becomes the cloud rows' user_id (RLS: auth.uid() = user_id).
// Anonymous sessions are never opened: they would upload data the user was
// promised stays on the device (privacy policy §1, login screen, Profile).

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GoogleSignin,
  isCancelledResponse,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';
import { clearSharedData } from './friends';
import { forgetPushToken, releasePushTokenForSignOut } from './pushTokens';

export interface AuthUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  // Google profile photo (Supabase mirrors the ID token's "picture" claim).
  avatarUrl: string | null;
}

// The uid sync should use, or null (sync stays off). Never signs in by itself.
// A leftover anonymous session from an older version is signed out instead of
// used; its cloud data stays untouched, and a later real sign-in is handled as
// an account switch (syncEngine.resolveAccountSwitch).
export async function ensureSignedIn(): Promise<string | null> {
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u) return null;
  if (!(u.is_anonymous ?? false)) return u.id;

  try {
    await supabase.auth.signOut();
  } catch (e) {
    // Retried next round; we already return null, so nothing is pushed meanwhile.
    console.warn('[Senkron] Kalıntı anonim oturum kapatılamadı:', e);
  }
  return null;
}

export async function currentUid(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function currentAuthUser(): Promise<AuthUser | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u) return null;
  return {
    id: u.id,
    email: u.email ?? null,
    isAnonymous: u.is_anonymous ?? false,
    avatarUrl: u.user_metadata?.avatar_url ?? u.user_metadata?.picture ?? null,
  };
}

// — SIGN IN WITH GOOGLE —
// The native account picker returns an ID token that is handed to Supabase
// (signInWithIdToken): one tap, without leaving the app.
// Setup: Google Cloud needs a "Web" client (its ID/secret go into Supabase ›
// Providers › Google) and an "Android" client (com.erek + signing SHA-1).
// EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID must be the WEB client's ID: Supabase checks
// the token's audience against it, so the Android ID gets rejected.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

// The UI hides the Google button when this is false.
export const isGoogleSignInConfigured = Boolean(GOOGLE_WEB_CLIENT_ID);

let googleConfigured = false;
function configureGoogleSignIn(): void {
  if (googleConfigured || !GOOGLE_WEB_CLIENT_ID) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  googleConfigured = true;
}

// The user dismissed the account picker — callers must not show it as an error.
export class GoogleSignInCancelled extends Error {
  constructor() {
    super('Google girişi iptal edildi');
    this.name = 'GoogleSignInCancelled';
  }
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error('Bulut senkron yapılandırılmadı');
  if (!GOOGLE_WEB_CLIENT_ID) throw new Error('Google girişi yapılandırılmadı');
  configureGoogleSignIn();
  // Missing/outdated Play Services: the SDK shows its own update dialog.
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await GoogleSignin.signIn();
  if (isCancelledResponse(res)) throw new GoogleSignInCancelled();
  const idToken = isSuccessResponse(res) ? res.data.idToken : null;
  if (!idToken) throw new Error('Google kimlik jetonu alınamadı');
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
}

// PERMANENTLY deletes the account and all its cloud data (a Play requirement)
// through the delete_account() RPC (supabase/schema.sql). Local data stays on the device.
export async function deleteAccountAndData(): Promise<void> {
  if (!supabase) throw new Error('Bulut senkron yapılandırılmadı');
  const { error } = await supabase.rpc('delete_account');
  if (error) throw error;
  // The server already dropped this device's push token with the account.
  await forgetPushToken();
  // The device's data now belongs to no account; a stale owner marker would
  // make the next sign-in look like an account switch.
  await AsyncStorage.removeItem('sync:ownerUid');
  await clearSharedData();
  try {
    await supabase.auth.signOut();
  } catch {
    // The user is gone server-side; a deleted user's token is rejected anyway.
  }
}

// Ends the session only; removing the account's data from the device is the
// caller's job (syncEngine.forgetAccountOnDevice).
export async function signOutAccount(): Promise<void> {
  if (!supabase) return;
  // Released while the session still exists (queued and retried if offline),
  // so friend nudges for this account stop reaching this phone.
  await releasePushTokenForSignOut();
  // Without this the next sign-in silently returns the same Google account
  // and the picker never opens. Fails harmlessly if Google was never used.
  try {
    await GoogleSignin.signOut();
  } catch {
    // see above
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  // Friends' names/avatars and shared data must not outlive the session.
  await clearSharedData();
}
