// Haptic feedback (expo-haptics); silently does nothing where unsupported.
// The Profile switch is cached here because tap*() is called synchronously
// from handlers: loadHapticsPref() at startup, setHapticsEnabled() on change.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const HAPTICS_KEY = 'haptics:enabled';

let enabled = true;

export async function loadHapticsPref(): Promise<boolean> {
  const v = await AsyncStorage.getItem(HAPTICS_KEY);
  enabled = v === null ? true : v === '1';
  return enabled;
}

export function isHapticsEnabled(): boolean {
  return enabled;
}

export async function setHapticsEnabled(value: boolean): Promise<void> {
  enabled = value; // cache first, so the very next tap obeys
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
