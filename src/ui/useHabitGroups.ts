// Shared-habit groups for every screen at once (Today, Habits, a habit's page,
// the "shared with you" list): one module-level snapshot, cache first, then the
// server. Screens refresh on focus; a refresh within REFRESH_MS of the last one
// is skipped unless forced (pull-to-refresh, after joining or leaving).

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  EMPTY_GROUPS,
  getCachedHabitGroups,
  refreshHabitGroups,
  type HabitGroupsSnapshot,
} from '@/sync';
import { ACCOUNTS_ENABLED } from '@/config';
import { useAppData } from '@/ui/AppData';

const REFRESH_MS = 20_000;

let snapshot: HabitGroupsSnapshot = EMPTY_GROUPS;
let owner: string | null = null; // the account the snapshot belongs to
let lastRefresh = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: HabitGroupsSnapshot) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// Switches the store to `account` (null = signed out): another account's groups never show.
function bindAccount(account: string | null) {
  if (owner === account) return;
  owner = account;
  lastRefresh = 0;
  publish(EMPTY_GROUPS);
  if (account) {
    getCachedHabitGroups().then((cached) => {
      if (owner === account && snapshot === EMPTY_GROUPS) publish(cached);
    });
  }
}

export async function refreshGroups(force = false): Promise<void> {
  const account = owner;
  if (!account) return;
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastRefresh < REFRESH_MS) return;
  inFlight = refreshHabitGroups()
    .then((fresh) => {
      lastRefresh = Date.now();
      if (owner === account) publish(fresh);
    })
    .catch(() => {
      // Offline / server hiccup: the cached snapshot stays.
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function useHabitGroups(): HabitGroupsSnapshot {
  const { authUser } = useAppData();
  const account = ACCOUNTS_ENABLED && authUser && !authUser.isAnonymous ? authUser.id : null;
  useEffect(() => bindAccount(account), [account]);
  useFocusEffect(
    useCallback(() => {
      bindAccount(account);
      refreshGroups();
    }, [account])
  );
  return useSyncExternalStore(subscribe, () => snapshot);
}
