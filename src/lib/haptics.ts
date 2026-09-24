// Haptic feedback wrapper (expo-haptics).
// Supported in Expo Go; SILENTLY ignored in an unsupported environment/on
// error (never crashes the app — same "inactive if missing" pattern as
// supabase/sentry). Three semantic levels: light tap, medium tap, success notification.
//
// USER PREFERENCE: can be turned off from Profile > Vibration ('haptics:enabled').
// This module is NON-React and tap*() calls are synchronous (called from
// within render/event handlers), so the preference is read from AsyncStorage
// once and CACHED inside the module (same pattern as getStoredLang /
// notificationPrefs). loadHapticsPref() is called on startup (see
// app/_layout.tsx); when the preference changes, setHapticsEnabled updates
// the cache immediately, so the very next tap goes silent right away.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const HAPTICS_KEY = 'haptics:enabled';

// Defaults to ON; refreshed with the stored preference on startup.
let enabled = true;

// Once on startup: load the stored preference into the cache.
export async function loadHapticsPref(): Promise<boolean> {
  const v = await AsyncStorage.getItem(HAPTICS_KEY);
  enabled = v === null ? true : v === '1';
  return enabled;
}

// For the Profile screen's initial value (reads the cache; correct after loadHapticsPref).
export function isHapticsEnabled(): boolean {
  return enabled;
}

export async function setHapticsEnabled(value: boolean): Promise<void> {
  enabled = value; // cache first — so the next tap behaves correctly without waiting
  await AsyncStorage.setItem(HAPTICS_KEY, value ? '1' : '0');
}

// A minor interaction (toggling a checkbox, +/− counter).
export function tapLight(): void {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// A notable action (starting the timer).
export function tapMedium(): void {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

// Positive completion (task/habit completed, goal reached, timer done).
export function notifySuccess(): void {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
