// Sync identity. THE ONE RULE: data leaves the device ONLY if the user
// knowingly signed into an account. Without a sign-in, sync is disabled and
// the app is entirely local.
// The returned uid becomes the user_id of the cloud rows (RLS: auth.uid() = user_id).
//
// ANONYMOUS SESSIONS ARE NO LONGER OPENED (2026-07-30). ensureSignedIn used to
// call signInAnonymously whenever it found no session. This was harmless
// while ACCOUNTS_ENABLED was off, since the path never ran; once the flag
// went live (see src/config.ts) it shipped this behavior: even if the user
// dismissed the login screen with "Skip for now", the runSync at startup (see
// ui/AppData.tsx) would open an anonymous cloud account and upload ALL local
// data. This contradicted the app's promise in three separate places:
//   - the privacy policy §1 ("If you don't sign in ... no data ever leaves your device")
//   - the login screen ('login.localNote': "your data stays on your device")
//   - the Profile footnote ('profile.footnoteLocal')
// The anonymous backup also had no benefit to the user: someone without an
// account can't bring that data back on another device, and loses it if they uninstall the app.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GoogleSignin,
  isCancelledResponse,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';

// Summary of the session's user (for showing account state in the UI).
export interface AuthUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
}

// Returns the uid sync should use; null if there ISN'T one (sync stays disabled).
// Does NOT sign in — it only uses an account session the user opened
// themselves (see the note at the top of the file).
//
// LEFTOVER ANONYMOUS SESSION: an anonymous session opened by a version before
// this change may still be sitting on the device. Continuing to use it would
// be the same silent upload all over again; so when found, it's signed out
// and sync stays disabled. The old anonymous data in the cloud is left
// UNTOUCHED: if the user later actually signs in, the sync:ownerUid marker
// gets this classified as an "account switch" and the merge/replace choice is
// offered (see syncEngine.classifySignIn) — so the old data neither disappears nor stays orphaned.
export async function ensureSignedIn(): Promise<string | null> {
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u) return null;
  if (!(u.is_anonymous ?? false)) return u.id;

  try {
    await supabase.auth.signOut();
  } catch (e) {
    // If it can't be signed out (e.g. no network), it's retried next round.
    // In the meantime we already return null, so no push HAPPENS with the leftover session — no lasting harm.
    console.warn('[Senkron] Kalıntı anonim oturum kapatılamadı:', e); // "Could not sign out leftover anonymous session"
  }
  return null;
}

// Is there a signed-in session? (for showing status in the UI)
export async function currentUid(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

// Summary of the session's user; null if there's no session. Returns
// is_anonymous and email to distinguish anonymous from account sessions.
export async function currentAuthUser(): Promise<AuthUser | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u) return null;
  return { id: u.id, email: u.email ?? null, isAnonymous: u.is_anonymous ?? false };
}

// Creates a NEW account with email + password.
// If "Confirm email" is on in the Supabase project, the session isn't opened
// right away; in that case needsConfirmation=true is returned (the user must
// click the link in the email, then sign in). If off, the session opens instantly.
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ needsConfirmation: boolean }> {
  if (!supabase) throw new Error('Bulut senkron yapılandırılmadı');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

// CONVERTS an existing ANONYMOUS session into a permanent account (keeps the same uid).
// Critical: signUp generates a new uid; in that case the anonymous data in the
// cloud would belong to "someone else" and the upsert would hit RLS. Since
// updateUser preserves the uid, the cloud rows' owner doesn't change → no
// conflict, no manual deletion needed.
// Note: if "Confirm email" is on, email confirmation is pending, but the
// password and uid are valid instantly; sync (which is uid-based) works right away.
//
// ONLY meaningful for LEFTOVER sessions now: since the app no longer opens an
// anonymous session on its own (see ensureSignedIn), only a user with a
// leftover anonymous session from an older version ever reaches this. For
// that user, this is still the CORRECT path: the uid is preserved, and their cloud data carries over intact to the new account.
export async function linkEmailToAnonymous(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Bulut senkron yapılandırılmadı');
  const { error } = await supabase.auth.updateUser({ email, password });
  if (error) throw error;
}

// — SIGN IN WITH GOOGLE —
// The native Google account picker (native SDK) opens, and the returned ID
// token is handed to Supabase (signInWithIdToken). Preferred over the
// browser-based OAuth flow because it's one tap with the accounts already on the system, without leaving the app.
//
// CONFIGURATION (outside the code, see the note on the app/login screen):
//   1. In Google Cloud Console, OAuth clients: "Web" (the one Supabase uses)
//      and "Android" (package name com.erek + the signing key's SHA-1).
//   2. In the Supabase dashboard, turn on Authentication > Providers > Google
//      and enter the WEB client's ID/secret.
//   3. In .env: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = that WEB client's ID.
// CRITICAL: the webClientId here is the WEB client, not the ANDROID one —
// Supabase compares the incoming ID token's "audience" field against its own
// configuration, so passing the Android ID gets the sign-in rejected server-side.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

// Is Google sign-in available? (is .env filled in — the UI hides the button
// based on this; showing the button without configuration would mean an error on every tap)
export const isGoogleSignInConfigured = Boolean(GOOGLE_WEB_CLIENT_ID);

// configure() only needs to run once per process lifetime; calling it on
// every sign-in is harmless but unnecessary — the flag keeps it to a single call.
let googleConfigured = false;
function configureGoogleSignIn(): void {
  if (googleConfigured || !GOOGLE_WEB_CLIENT_ID) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  googleConfigured = true;
}

// Thrown when the user dismisses the account picker. The caller must not
// display this as an ERROR — backing out isn't an error (see LoginScreen).
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
  // If Play Services is missing/outdated, the SDK shows the user an update dialog.
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await GoogleSignin.signIn();
  if (isCancelledResponse(res)) throw new GoogleSignInCancelled();
  const idToken = isSuccessResponse(res) ? res.data.idToken : null;
  if (!idToken) throw new Error('Google kimlik jetonu alınamadı');
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
}

// Signs into an existing account with email + password.
export async function signInWithEmail(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Bulut senkron yapılandırılmadı');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// — PASSWORD RESET — an IN-app code flow (no deep link/web page needed):
// 1) requestPasswordReset(email): Supabase sends a recovery email.
//    IMPORTANT: the email template must show the 6-digit code ({{ .Token }}) —
//    add {{ .Token }} to the "Reset Password" template under Authentication >
//    Email Templates in the Supabase dashboard (the default template only has a link).
// 2) resetPasswordWithCode(email, code, newPassword): verifies the code with
//    verifyOtp(type: 'recovery') (which also opens a session) and writes the
//    new password with updateUser. On success the user ends up SIGNED IN.
export async function requestPasswordReset(email: string): Promise<void> {
  if (!supabase) throw new Error('Bulut senkron yapılandırılmadı');
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function resetPasswordWithCode(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  if (!supabase) throw new Error('Bulut senkron yapılandırılmadı');
  const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'recovery' });
  if (error) throw error;
  const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
  if (updErr) throw updErr;
}

// PERMANENTLY deletes the account and ALL of its cloud data (a Google Play
// account-deletion requirement). Calls the server's SECURITY DEFINER
// delete_account() RPC (see supabase/schema.sql): deletes the user's rows and
// their auth record in a single operation. Local data STAYS on the device;
// downgrading the user to anonymous is the caller's job.
export async function deleteAccountAndData(): Promise<void> {
  if (!supabase) throw new Error('Bulut senkron yapılandırılmadı');
  const { error } = await supabase.rpc('delete_account');
  if (error) throw error;
  // The cloud account is deleted: the device's data now belongs to NO
  // account. If the ownership marker stayed, the next sign-in would be
  // wrongly classified as an "account switch" and the user would needlessly get the merge/replace prompt.
  await AsyncStorage.removeItem('sync:ownerUid');
  // The user is already deleted server-side; if the local sign-out errors
  // (invalid token, etc.) it doesn't matter: sync only works with a VALID
  // account session, and a push made with a deleted user's token gets rejected server-side anyway.
  try {
    await supabase.auth.signOut();
  } catch {
    // swallowed — see the note above
  }
}

// Signs out of the account. Local data stays on the device; since the session
// is gone, sync stays disabled on its own until the user signs in again
// (ensureSignedIn never opens a session — see the note at the top of the file).
export async function signOutAccount(): Promise<void> {
  if (!supabase) return;
  // The Google session is also released: otherwise, on the next sign-in, the
  // account picker wouldn't even open and it would silently return the same
  // account, leaving the user unable to switch accounts.
  // If the user never signed in with Google, this call already fails silently — swallowed.
  try {
    await GoogleSignin.signOut();
  } catch {
    // swallowed — see the note above
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
