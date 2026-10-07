// What this phone is entitled to: restored from the offline cache before the
// first render, kept in step with the store afterwards, and published to the
// app with a tiny store (like fontStore) so gated screens repaint the moment a
// purchase goes through — or a subscription lapses.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import {
  adsRemoved,
  cacheFromCustomerInfo,
  featuresUnlocked,
  grantActive,
  INITIAL_STATE,
  INTRO_MS,
  parseCache,
  serializeCache,
  type CustomerInfoLike,
  type PlusCache,
  type PlusState,
} from './plusLogic';
import { configurePurchases, currentCustomerInfo, listenCustomerInfo, purchasesAvailable } from './purchases';

export const PLUS_CACHE_KEY = 'plus:cache';
// When the first build that can sell started; the intro period counts from it.
export const INTRO_START_KEY = 'plus:introStart';

let state: PlusState = INITIAL_STATE;
const listeners = new Set<() => void>();

export const getPlusState = (): PlusState => state;
// Non-React callers (ads, widgets).
export const isAdsRemoved = (): boolean => adsRemoved(state);
export const areFeaturesUnlocked = (): boolean => featuresUnlocked(state);

export function subscribePlus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePlusState(): PlusState {
  return useSyncExternalStore(subscribePlus, getPlusState);
}

// Are the Plus features open for this render? (Re-reads the clock, so an
// ending intro period shows up on the next render.)
export function useFeaturesUnlocked(): boolean {
  return featuresUnlocked(usePlusState());
}

function set(next: PlusState): void {
  if (
    next.billing === state.billing &&
    next.plus === state.plus &&
    next.adsFree === state.adsFree &&
    next.introEndsAt === state.introEndsAt
  ) {
    return;
  }
  state = next;
  listeners.forEach((l) => l());
}

function applyCache(cache: PlusCache | null, now: number): void {
  set({
    ...state,
    plus: cache ? grantActive(cache.plus, now) : false,
    adsFree: cache ? grantActive(cache.adsFree, now) : false,
  });
}

// Startup, before the first render: the cached answers and the intro period,
// no network. Never rejects — on any trouble the app starts unlocked-by-default
// (billing off) rather than locking anyone out.
export async function initPlus(now: number = Date.now()): Promise<void> {
  try {
    const billing = purchasesAvailable();
    let introEndsAt: number | null = null;
    if (billing) {
      let start = Number(await AsyncStorage.getItem(INTRO_START_KEY));
      if (!Number.isFinite(start) || start <= 0) {
        start = now;
        await AsyncStorage.setItem(INTRO_START_KEY, String(start));
      }
      introEndsAt = start + INTRO_MS;
    }
    state = { ...INITIAL_STATE, billing, introEndsAt };
    applyCache(parseCache(await AsyncStorage.getItem(PLUS_CACHE_KEY)), now);
  } catch {
    state = INITIAL_STATE;
  }
}

// An answer from the store (purchase, restore, renewal, expiry).
export function applyCustomerInfo(info: CustomerInfoLike): void {
  const cache = cacheFromCustomerInfo(info);
  AsyncStorage.setItem(PLUS_CACHE_KEY, serializeCache(cache)).catch(() => {});
  applyCache(cache, Date.now());
}

let started = false;

// After the first render: connect to RevenueCat, take its current answer and
// follow later changes. Safe to call more than once; does nothing when
// purchases aren't available on this build.
export function startPlusSync(): void {
  if (started) return;
  started = true;
  configurePurchases()
    .then(async (ok) => {
      if (!ok) return;
      listenCustomerInfo(applyCustomerInfo);
      const info = await currentCustomerInfo();
      if (info) applyCustomerInfo(info);
    })
    .catch(() => {});
}
