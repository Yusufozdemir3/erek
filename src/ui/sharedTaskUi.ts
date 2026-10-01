// Shared-task helpers for the Today and Tasks screens.
//   - useFriends: connected friends (cache first; optional network refresh),
//     only when signed into a real account.
//   - toggleSharedTaskOptimistic: a recipient's check-off — instant local
//     feedback, the server's answer written back, rollback on failure.
//   - useSharedTasksFreshness: when shared tasks exist, a focused screen pulls
//     at most once a minute so the other person's check-off shows up.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { taskRepo } from '@/db';
import type { Task } from '@/db';
import { ACCOUNTS_ENABLED } from '@/config';
import { nowIso } from '@/lib/helpers';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { getCachedFriends, listConnections, type Friend } from '@/sync/friends';
import { toggleSharedTask } from '@/sync/sharedTasks';
import { sharingErrorKey, toSharingError } from '@/sync/sharingErrors';
import { useOptionalAppData } from '@/ui/AppData';

const FRESHNESS_MIN_GAP_MS = 60_000;

export function useFriends(refresh = false): Friend[] {
  const app = useOptionalAppData();
  const signedIn = ACCOUNTS_ENABLED && !!app?.authUser && !app.authUser.isAnonymous;
  const [friends, setFriends] = useState<Friend[]>([]);

  useEffect(() => {
    if (!signedIn) {
      setFriends([]);
      return;
    }
    let active = true;
    getCachedFriends().then((cached) => {
      if (active) setFriends(cached);
    });
    if (refresh) {
      listConnections()
        .then((list) => {
          if (active) setFriends(list);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [signedIn, refresh]);

  return friends;
}

// Names for the "👥 name" badges. Cache only — unless a badge needs a uid the
// cache doesn't know (e.g. you created the invite and never reopened the
// Friends screen after your friend redeemed it); then the list is refreshed,
// at most once per app session.
let namesRefreshedThisSession = false;

export function useFriendNames(neededUids: (string | null)[] = []): Map<string, string> {
  const app = useOptionalAppData();
  const signedIn = ACCOUNTS_ENABLED && !!app?.authUser && !app.authUser.isAnonymous;
  const [friends, setFriends] = useState<Friend[]>([]);
  const needed = neededUids.filter((u): u is string => !!u);
  const neededKey = [...new Set(needed)].sort().join(',');

  useEffect(() => {
    if (!signedIn) {
      setFriends([]);
      return;
    }
    let active = true;
    getCachedFriends().then((cached) => {
      if (!active) return;
      setFriends(cached);
      const known = new Set(cached.map((f) => f.id));
      const missing = neededKey !== '' && neededKey.split(',').some((u) => !known.has(u));
      if (missing && !namesRefreshedThisSession) {
        namesRefreshedThisSession = true;
        listConnections()
          .then((list) => {
            if (active) setFriends(list);
          })
          .catch(() => {});
      }
    });
    return () => {
      active = false;
    };
  }, [signedIn, neededKey]);

  return useMemo(
    () => new Map(friends.filter((f) => f.displayName).map((f) => [f.id, f.displayName as string])),
    [friends]
  );
}

export async function toggleSharedTaskOptimistic(
  task: Task,
  reload: () => void,
  t: (key: string, params?: Record<string, string | number>) => string,
  onGone?: () => void
): Promise<void> {
  const completing = task.completed_at === null;
  // Optimistic: keep the old updated_at so the server's answer (newer) wins
  // over this placeholder in any concurrent pull.
  taskRepo.applySharedCompletion(task.id, completing ? nowIso() : null, task.updated_at);
  completing ? notifySuccess() : tapLight();
  reload();
  try {
    const r = await toggleSharedTask(task.id, completing);
    taskRepo.applySharedCompletion(task.id, r.completedAt, r.updatedAt);
  } catch (e) {
    taskRepo.applySharedCompletion(task.id, task.completed_at, task.updated_at);
    Alert.alert(t('friends.errorTitle'), t(sharingErrorKey(e)));
    if (toSharingError(e).code === 'ERK_NOT_SHARED') onGone?.();
  }
  reload();
}

// Gate on the last ATTEMPT (success or not), not on the last success: with a
// persistent sync error, a success-based gate would retry on every re-render.
let lastFreshnessAttempt = 0;

export function useSharedTasksFreshness(reload: () => void): void {
  const app = useOptionalAppData();
  const userId = app?.user.id;
  const syncNow = app?.syncNow;

  useFocusEffect(
    useCallback(() => {
      if (!userId || !syncNow) return;
      if (Date.now() - lastFreshnessAttempt < FRESHNESS_MIN_GAP_MS) return;
      if (!taskRepo.hasSharedTasks(userId)) return;
      lastFreshnessAttempt = Date.now();
      let active = true;
      syncNow()
        .then(() => {
          if (active) reload();
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [userId, syncNow, reload])
  );
}
