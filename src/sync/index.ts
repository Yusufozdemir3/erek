// Senkron katmanının tek giriş noktası.
// UI buradan import eder: import { runSync, isSyncConfigured } from '@/sync';

export { supabase, isSyncConfigured } from './supabase';
export {
  ensureSignedIn,
  currentUid,
  currentAuthUser,
  signUpWithEmail,
  linkEmailToAnonymous,
  signInWithEmail,
  signOutAccount,
  deleteAccountAndData,
  requestPasswordReset,
  resetPasswordWithCode,
  type AuthUser,
} from './auth';
export { runSync, prepareFullResync, clearLocalData, type SyncResult } from './syncEngine';
