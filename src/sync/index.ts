// The single entry point of the sync layer.
// The UI imports from here: import { runSync, isSyncConfigured } from '@/sync';

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
  // Account switching: classification + the two resolution paths (see the syncEngine header).
  classifySignIn,
  getSyncOwner,
  setSyncOwner,
  isOwnershipConflict,
  prepareMergeIntoAccount,
  prepareReplaceWithAccount,
  type SignInKind,
  type SyncResult,
} from './syncEngine';
