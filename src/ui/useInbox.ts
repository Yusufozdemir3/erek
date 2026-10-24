// The Notifications inbox state, shared by the bell on every tab and the
// inbox screen: one module-level store, so the tabs don't each hit the server
// and the unread dot agrees everywhere. Refreshed on focus (at most once a
// minute), when a push arrives (PushBridge) and on pull-to-refresh.

import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getCachedInbox, getInbox, getInboxSeenAt, setInboxSeenAt } from '@/sync';
import { newestAt, unreadCount, type InboxItem } from '@/lib/inbox';
import { ACCOUNTS_ENABLED } from '@/config';
import { useAppData } from '@/ui/AppData';

interface State {
  items: InboxItem[];
  seenAt: string | null;
  loaded: boolean;
}

const MIN_GAP_MS = 60 * 1000;
let state: State = { items: [], seenAt: null, loaded: false };
let lastFetch = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
}

// force: skip the once-a-minute gate (a push just arrived, pull-to-refresh).
export function refreshInbox(force = false): Promise<void> {
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastFetch < MIN_GAP_MS) return Promise.resolve();
  lastFetch = Date.now();
  inFlight = (async () => {
    try {
      if (!state.loaded) {
        const [cached, seenAt] = await Promise.all([getCachedInbox(), getInboxSeenAt()]);
        set({ items: cached, seenAt, loaded: true });
      }
      set({ items: await getInbox() });
    } catch {
      // Offline / server hiccup: keep what's shown.
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// Opening the inbox: everything up to its newest row counts as read.
export async function markInboxSeen(): Promise<void> {
  const newest = newestAt(state.items);
  if (!newest || newest === state.seenAt) return;
  set({ seenAt: newest });
  await setInboxSeenAt(newest);
}

// Signed out: forget the state (the caches go with clearSharedData()).
function reset() {
  lastFetch = 0;
  set({ items: [], seenAt: null, loaded: false });
}

export function useInbox() {
  const { authUser } = useAppData();
  const signedIn = ACCOUNTS_ENABLED && authUser != null && !authUser.isAnonymous;
  const [, rerender] = useState(0);

  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  useEffect(() => {
    if (!signedIn && state.loaded) reset();
  }, [signedIn]);

  useFocusEffect(
    useCallback(() => {
      if (signedIn) refreshInbox();
    }, [signedIn])
  );

  return {
    signedIn,
    items: signedIn ? state.items : [],
    unread: signedIn ? unreadCount(state.items, state.seenAt) : 0,
    seenAt: state.seenAt,
    loaded: state.loaded,
  };
}

// Tests only.
export function __resetInboxForTests() {
  inFlight = null;
  reset();
}
