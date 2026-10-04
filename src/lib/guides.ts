// Per-feature first-visit guides ("Hedefler nedir?", "Arkadaşlar nasıl çalışır?").
// What lives here: which guides exist, and the on-phone memory of which ones a
// person has seen. The pages themselves are in ui/guide/guideContent.ts.
//
// WHO SEES THEM BY ITSELF: only a NEW install. The setup wizard's gate calls
// markNewInstall() the first time it finds the wizard unseen; someone who was
// already using the app never gets that mark, so for them the guides are just a
// "?" button on each screen, never an interruption. Every guide shows by itself
// at most once, and only after the setup wizard is finished.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACCOUNTS_ENABLED } from '@/config';

export const GUIDE_IDS = ['goals', 'habits', 'friends', 'tasks', 'today', 'widgets', 'notifications'] as const;
export type GuideId = (typeof GUIDE_IDS)[number];

export const NEW_INSTALL_KEY = 'guide:newInstall';
export const guideSeenKey = (id: GuideId) => `guide:seen:${id}`;
// The setup wizard's own "finished" flag and the login screen's "seen" flag
// (same keys as ui/Onboarding and ui/LoginScreen).
const ONBOARDING_DONE_KEY = 'onboarding:done';
const LOGIN_SEEN_KEY = 'login:seen';

async function read(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // A flag that can't be written only means the guide may show once more.
  }
}

export const markNewInstall = () => write(NEW_INSTALL_KEY, '1');
export const markGuideSeen = (id: GuideId) => write(guideSeenKey(id), '1');

export async function hasSeenGuide(id: GuideId): Promise<boolean> {
  return (await read(guideSeenKey(id))) === '1';
}

// Should this guide open on its own right now? New install, the setup wizard
// AND the login screen that follows it are out of the way (two full-screen
// layers must never stack), guide not seen yet.
export async function shouldAutoShowGuide(id: GuideId): Promise<boolean> {
  const [fresh, wizardDone, loginSeen, seen] = await Promise.all([
    read(NEW_INSTALL_KEY),
    read(ONBOARDING_DONE_KEY),
    read(LOGIN_SEEN_KEY),
    read(guideSeenKey(id)),
  ]);
  const loginOut = !ACCOUNTS_ENABLED || loginSeen === '1';
  return fresh === '1' && wizardDone === '1' && loginOut && seen !== '1';
}

// A screen that is already on display while the wizard / login screen runs
// (the Today tab) has to hear when they close. The wizard gate and the login
// gate call announceGatesClosed(); screens re-check in useFeatureGuide.
const listeners = new Set<() => void>();

export function onGatesClosed(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function announceGatesClosed(): void {
  for (const fn of listeners) fn();
}
