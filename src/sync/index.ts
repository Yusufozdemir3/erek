// The single entry point of the sync layer.
// The UI imports from here: import { runSync, isSyncConfigured } from '@/sync';

export { supabase, isSyncConfigured } from './supabase';
export {
  ensureSignedIn,
  currentUid,
  currentAuthUser,
  signInWithGoogle,
  isGoogleSignInConfigured,
  GoogleSignInCancelled,
  signOutAccount,
  deleteAccountAndData,
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
export { sendCongrats, lastCelebrationStatus, announceFinishedShares, hasPendingFinished, sendHabitInvite, sendGroupDone } from './celebrations';
export { sendNudge, getNudgePrefs, setNudgeMute, setNudgesEnabled, type NudgePrefs } from './nudges';
export { getInbox, getCachedInbox, getInboxSeenAt, setInboxSeenAt } from './inbox';
export {
  shareHabit,
  setHabitShareMode,
  listHabitShareModes,
  unshareHabit,
  listHabitShares,
  getSharedHabits,
  getCachedSharedHabits,
  getCachedSharedHabitLogs,
  syncSharedHabitLogs,
  type SharedHabit,
} from './sharedHabits';
export {
  joinHabitGroup,
  leaveHabitGroup,
  getCachedHabitGroups,
  refreshHabitGroups,
  EMPTY_GROUPS,
  type HabitGroup,
  type HabitGroupMember,
  type HabitGroupsSnapshot,
  type GroupLogs,
} from './habitGroups';
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
export {
  toggleSharedTask,
  addSharedSubtask,
  deleteSharedSubtask,
  getTaskParticipants,
  type TaskParticipant,
} from './sharedTasks';
export { setNickname, nicknameOf, NICKNAME_MAX } from './nicknames';
export { getMyUsername, setMyUsername, type SetUsernameResult } from './username';
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
