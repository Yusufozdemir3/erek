// Data for a friend's shared goal: shown from cache immediately, then
// refreshed from the server. Stats are computed by the SAME pure function as
// the owner's own goal screen (computeGoalStats), so pace and projections match.

import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { todayDate } from '@/lib/helpers';
import {
  addSharedGoalEntry,
  getCachedSharedGoalDetail,
  getSharedGoalDetail,
  toSharingError,
  type SharedGoalDetail,
} from '@/sync';
import { computeGoalStats, EMPTY_GOAL_STATS, type GoalStats } from '@/ui/useGoalStats';

export type SharedGoalStatus = 'loading' | 'ready' | 'offline' | 'gone';

export interface SharedGoalData {
  detail: SharedGoalDetail | null;
  stats: Omit<GoalStats, 'reload'>;
  status: SharedGoalStatus;
  // Adds progress to the owner's goal (online only). Resolves with the amount
  // actually applied; rejects with a SharingError the caller shows.
  contribute: (amount: number) => Promise<number>;
}

export function useSharedGoal(goalId: string): SharedGoalData {
  const [detail, setDetail] = useState<SharedGoalDetail | null>(null);
  const [status, setStatus] = useState<SharedGoalStatus>('loading');

  const refresh = useCallback(async (isActive: () => boolean) => {
    try {
      const fresh = await getSharedGoalDetail(goalId);
      if (!isActive()) return;
      setDetail(fresh);
      setStatus('ready');
    } catch (e) {
      if (!isActive()) return;
      if (toSharingError(e).code === 'ERK_NOT_SHARED') {
        setDetail(null);
        setStatus('gone');
      } else {
        setStatus('offline');
      }
    }
  }, [goalId]);

  const load = useCallback(() => {
    let active = true;
    const isActive = () => active;
    (async () => {
      const cached = await getCachedSharedGoalDetail(goalId);
      if (active && cached) setDetail(cached);
      await refresh(isActive);
    })();
    return () => {
      active = false;
    };
  }, [goalId, refresh]);

  useFocusEffect(load);

  const contribute = useCallback(
    async (amount: number) => {
      const { applied } = await addSharedGoalEntry(goalId, amount);
      // Re-read the whole goal: the new total, and this entry in the history.
      await refresh(() => true);
      return applied;
    },
    [goalId, refresh]
  );

  const stats = useMemo(
    () =>
      detail
        ? computeGoalStats(detail.goal, detail.milestones, detail.entries, [], todayDate())
        : EMPTY_GOAL_STATS,
    [detail]
  );

  return { detail, stats, status, contribute };
}
