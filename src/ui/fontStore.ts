// The user's typeface choice: kept in AsyncStorage, loaded on demand, and
// published to the app with a tiny store (every <Text> subscribes through
// applyFont.ts, so a change repaints the whole app without remounting it).
//
// Only the chosen family's five files are loaded at startup; the others load
// when the Appearance screen previews them or when they are picked.
//
// The bundled typefaces are a Plus feature: the SAVED choice is kept, but the
// one APPLIED falls back to the phone's font while locked — and returns with Plus.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Font from 'expo-font';
import { useSyncExternalStore } from 'react';
import { effectiveFont } from '@/plus/plusLogic';
import { areFeaturesUnlocked, subscribePlus } from '@/plus/plusStore';
import { FONT_FILES } from './fontAssets';
import { DEFAULT_FONT, isFontChoice, type FontChoice } from './fontFamily';

export const FONT_CHOICE_KEY = 'font:choice';

let current: FontChoice = DEFAULT_FONT;
const listeners = new Set<() => void>();
const loaded = new Set<FontChoice>(['system']);

// The saved choice (what the picker remembers), whatever Plus says.
export const getFontChoice = (): FontChoice => current;

// The typeface actually applied: the saved one if allowed AND its files are
// loaded (text drawn with an unloaded family would stay in the system font even
// after the files arrive), otherwise the phone's own font.
export function getEffectiveFont(): FontChoice {
  const wanted = effectiveFont(current, areFeaturesUnlocked());
  return loaded.has(wanted) ? wanted : 'system';
}

const notify = () => listeners.forEach((l) => l());

// Plus just started: make sure the saved typeface is ready, then repaint.
subscribePlus(() => {
  const wanted = effectiveFont(current, areFeaturesUnlocked());
  if (loaded.has(wanted)) {
    notify();
    return;
  }
  loadFontFiles(wanted)
    .then(notify)
    .catch(() => {});
});

export function subscribeFont(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// The applied typeface, live (re-renders on a pick and when Plus starts or ends).
export function useFontChoice(): FontChoice {
  return useSyncExternalStore(subscribeFont, getEffectiveFont);
}

export function isFontLoaded(choice: FontChoice): boolean {
  return loaded.has(choice);
}

// Loads one family's files (once). Rejects if they can't be loaded.
export async function loadFontFiles(choice: FontChoice): Promise<void> {
  if (loaded.has(choice) || choice === 'system') return;
  await Font.loadAsync(FONT_FILES[choice]);
  loaded.add(choice);
}

// Startup: restore the saved choice and have the files of the one that will be
// applied ready before the first render (call after initPlus). Anything
// unexpected falls back to the phone's font — never a blank app.
export async function initFont(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(FONT_CHOICE_KEY);
    const choice = isFontChoice(saved) ? saved : DEFAULT_FONT;
    current = choice;
    await loadFontFiles(effectiveFont(choice, areFeaturesUnlocked()));
  } catch {
    current = 'system';
  }
}

// Switches the typeface now. Returns false (and changes nothing) if the
// family's files can't be loaded. The picker decides whether the user may pick
// it; a locked row leads to the Plus screen instead.
export async function setFontChoice(choice: FontChoice): Promise<boolean> {
  try {
    await loadFontFiles(choice);
  } catch {
    return false;
  }
  current = choice;
  notify();
  AsyncStorage.setItem(FONT_CHOICE_KEY, choice).catch(() => {});
  return true;
}
