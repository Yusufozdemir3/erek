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
  signInWithGoogle,
  isGoogleSignInConfigured,
  GoogleSignInCancelled,
  signOutAccount,
  deleteAccountAndData,
  requestPasswordReset,
  resetPasswordWithCode,
  type AuthUser,
} from './auth';
export {
  runSync,
  prepareFullResync,
  clearLocalData,
  // Hesap değişimi: sınıflandırma + iki çözüm yolu (bkz. syncEngine başlığı).
  classifySignIn,
  getSyncOwner,
  setSyncOwner,
  isOwnershipConflict,
  prepareMergeIntoAccount,
  prepareReplaceWithAccount,
  type SignInKind,
  type SyncResult,
} from './syncEngine';
