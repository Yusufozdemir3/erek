// Google sign-in plus everything around it, shared by the login screen and the
// setup wizard's account step.

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
  available: boolean; // Google sign-in and sync are configured
  busy: boolean;
  error: string | null;
  signIn: () => Promise<void>;
}

// onDone runs after sign-in and the first sync (not on cancel/error).
export function useGoogleSignIn(onDone: () => void): GoogleSignIn {
  const { t } = useI18n();
  // The first sync goes through syncNow, which keeps the shared sync state.
  const { user, refreshUser, refreshAuthUser, notifyDataChanged, syncNow } = useAppData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();

      // Before the first push: data that belongs to another account would be
      // rejected by RLS. Sign-out wipes the device, so a 'switch' only comes from
      // an older version's data; resolveAccountSwitch settles it without asking.
      const uid = await currentUid();
      const kind = uid ? await classifySignIn(uid) : 'fresh';
      if (kind === 'switch') {
        await resolveAccountSwitch();
        // Ids changed or rows were deleted: old triggers can't be found by
        // prefix anymore. Rebuild now, even if the sync below fails offline.
        await cancelAllReminders();
        await rescheduleEverything(user.id);
        notifyDataChanged();
      } else if (kind === 'fresh') {
        // Never pushed to any account (or that account was deleted), but rows
        // may be marked synced=1: resend everything.
        await prepareFullResync();
      }
      // 'same': nothing to prepare — pending rows and watermarks are already right.

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
      // Closing the account picker isn't an error.
      if (!(e instanceof GoogleSignInCancelled)) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return { available: isGoogleSignInConfigured && isSyncConfigured, busy, error, signIn };
}
