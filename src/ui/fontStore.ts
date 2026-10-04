// The user's typeface choice: kept in AsyncStorage, loaded on demand, and
// published to the app with a tiny store (every <Text> subscribes through
// applyFont.ts, so a change repaints the whole app without remounting it).
//
// Only the chosen family's five files are loaded at startup; the others load
// when the Appearance screen previews them or when they are picked.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Font from 'expo-font';
import { useSyncExternalStore } from 'react';
import { FONT_FILES } from './fontAssets';
import { DEFAULT_FONT, isFontChoice, type FontChoice } from './fontFamily';

export const FONT_CHOICE_KEY = 'font:choice';

let current: FontChoice = DEFAULT_FONT;
const listeners = new Set<() => void>();
const loaded = new Set<FontChoice>(['system']);

export const getFontChoice = (): FontChoice => current;

export function subscribeFont(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFontChoice(): FontChoice {
  return useSyncExternalStore(subscribeFont, getFontChoice);
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

// Startup: restore the saved choice and have its files ready before the first
// render. Anything unexpected falls back to the phone's font — never a blank app.
export async function initFont(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(FONT_CHOICE_KEY);
    const choice = isFontChoice(saved) ? saved : DEFAULT_FONT;
    await loadFontFiles(choice);
    current = choice;
  } catch {
    current = 'system';
  }
}

// Switches the typeface now. Returns false (and changes nothing) if the
// family's files can't be loaded.
export async function setFontChoice(choice: FontChoice): Promise<boolean> {
  try {
    await loadFontFiles(choice);
  } catch {
    return false;
  }
  current = choice;
  listeners.forEach((l) => l());
  AsyncStorage.setItem(FONT_CHOICE_KEY, choice).catch(() => {});
  return true;
}
