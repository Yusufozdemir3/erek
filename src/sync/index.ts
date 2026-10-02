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
  getInvite,
  redeemInvite,
  listConnections,
  removeConnection,
  getCachedFriends,
  clearSharedData,
  normalizeInviteCode,
  INVITE_CODE_LENGTH,
  type Friend,
  type Invite,
} from './friends';
export { SharingError, sharingErrorKey, toSharingError, type SharingErrorCode } from './sharingErrors';
export {
  shareHabit,
  unshareHabit,
  listHabitShares,
  getSharedHabits,
  getCachedSharedHabits,
  getCachedSharedHabitLogs,
  syncSharedHabitLogs,
  type SharedHabit,
} from './sharedHabits';
export {
  shareGoal,
  unshareGoal,
  listGoalShares,
  getSharedGoals,
  getCachedSharedGoals,
  getSharedGoalDetail,
  getCachedSharedGoalDetail,
  addSharedGoalEntry,
  type SharedGoal,
  type SharedGoalDetail,
} from './sharedGoals';
export { toggleSharedTask } from './sharedTasks';
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
  pendingChangeCount,
  forgetAccountOnDevice,
  resolveAccountSwitch,
  type SignInKind,
  type SyncResult,
} from './syncEngine';
