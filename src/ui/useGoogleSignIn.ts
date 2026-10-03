// Google sign-in with everything that has to happen around it, shared by the
// login screen and the setup wizard's account step (moved out of LoginScreen
// unchanged — see the comments below for why each step is there).

import { useState } from 'react';
import { userRepo } from '@/db';
import { cancelAllReminders, rescheduleEverything } from '@/lib/notifications';
import {
  classifySignIn,
  currentAuthUser,
  currentUid,
  GoogleSignInCancelled,
  isGoogleSignInConfigured,
  isSyncConfigured,
  prepareFullResync,
  resolveAccountSwitch,
  signInWithGoogle,
} from '@/sync';
import { useAppData } from '@/ui/AppData';
import { useI18n } from '@/i18n/I18nProvider';

export interface GoogleSignIn {
  available: boolean; // Google sign-in AND sync are configured in this build
  busy: boolean;
  error: string | null;
  signIn: () => Promise<void>;
}

// onDone runs after a successful sign-in AND first sync (not on cancel/error).
export function useGoogleSignIn(onDone: () => void): GoogleSignIn {
  const { t } = useI18n();
  // The first pass after sign-in also goes through AppData's syncNow (runSync is
  // NOT called directly): keeps the "last backup" timestamp and sync error state
  // consolidated in one place.
  const { user, refreshUser, refreshAuthUser, notifyDataChanged, syncNow } = useAppData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();

      // ACCOUNT-SWITCH CHECK (before the first push). Since local ids don't
      // change when the account changes, pushing data that was already sent to a
      // different account as-is would get rejected by RLS and permanently lock up
      // sync. See sync/syncEngine.ts (classifySignIn).
      // NO QUESTION IS ASKED any more ("merge or replace?" used to be — a
      // technical decision users shouldn't have to make). Sign-out now forgets
      // the account's data on the device (see "DATA BELONGS TO THE ACCOUNT" in
      // syncEngine.ts), so 'switch' only happens with data left behind by an
      // older version — and resolveAccountSwitch settles it so nothing is lost.
      const uid = await currentUid();
      const kind = uid ? await classifySignIn(uid) : 'fresh';
      if (kind === 'switch') {
        await resolveAccountSwitch();
        // Merge regenerated every id, replace deleted every row: the triggers in
        // the OS notification queue now point at ids that no longer exist
        // (cancelHabitReminders(newId) can never find them, so they'd fire
        // forever, next to the rebuilt ones). Nuke + rebuild RIGHT HERE, not
        // after the sync: this used to sit behind the sync-error early return
        // below, so a switch made offline left the orphans in place. Whatever
        // the sync pulls in afterwards gets scheduled by AppData.syncNow.
        await cancelAllReminders();
        await rescheduleEverything(user.id);
        notifyDataChanged();
      } else if (kind === 'fresh') {
        // This device's data was never sent to any account (or the account it was
        // linked to was deleted — deleteAccountAndData clears the ownership stamp).
        // Rows may still be marked synced=1, so all of them need to be resent.
        await prepareFullResync();
      }
      // kind === 'same': NO PREP NEEDED. The data already belongs to this account;
      // pending rows are already synced=0 (every repo write marks them that way)
      // and the watermarks are valid for this account. This used to call
      // prepareFullResync() here too: for someone who'd been using the app for
      // years, that meant re-pushing tens of thousands of rows plus re-fetching
      // every table from scratch on every sign-in — a costly round trip in mobile
      // data and battery that gained nothing.

      // Write the email into the local user record (upgrade to an account-linked state).
      const authUser = await currentAuthUser();
      if (authUser?.email) userRepo.upgradeToAccount(user.id, authUser.email);

      const result = await syncNow();
      if (result.status === 'error') {
        setError(result.ownershipConflict ? t('sync.ownershipConflict') : (result.message ?? ''));
        return;
      }

      refreshUser();
      refreshAuthUser();
      onDone();
    } catch (e) {
      // Backing out isn't an error: showing red error text to a user who just
      // closed the account picker would be the wrong feedback.
      if (!(e instanceof GoogleSignInCancelled)) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return { available: isGoogleSignInConfigured && isSyncConfigured, busy, error, signIn };
}
