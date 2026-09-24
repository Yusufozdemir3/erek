// The snapshot type the home-screen widget READS, plus AsyncStorage access.
// This file DELIBERATELY imports no repo (expo-sqlite): the widget's
// background (headless) task handler only reads the ready-made snapshot from
// here — SQLite isn't reliable in that context. The side that PRODUCES the
// snapshot (the app process) is src/widget/widgetData.ts.

import AsyncStorage from '@react-native-async-storage/async-storage';

// Must be EXACTLY the same as the widget name defined in app.json's config plugin.
export const WIDGET_NAME = 'ErekToday';
export const SNAPSHOT_KEY = 'widget:today';

export interface WidgetHabit {
  id: string;
  title: string;
  color: string; // the resolved color (the habit's color or the default)
  completed: boolean;
}

// The colors the widget will render with — embedded in the snapshot so the
// headless handler renders with the correct theme (light/dark + accent) even when the app isn't open.
export interface WidgetColors {
  bg: string;
  card: string;
  text: string;
  muted: string;
  faint: string;
  primary: string;
  done: string;
  border: string;
  onAccent: string;
}

export interface WidgetSnapshot {
  date: string; // "YYYY-MM-DD" — today at the moment the snapshot was written
  dateLabel: string; // localized full date ("Wednesday, July 16, 2026")
  title: string; // "Today" (localized)
  summaryLabel: string; // "3/5 completed" (localized)
  emptyLabel: string; // localized text shown when the list is empty
  doneCount: number;
  totalCount: number;
  habits: WidgetHabit[];
  colors: WidgetColors;
}

export async function writeSnapshot(s: WidgetSnapshot): Promise<void> {
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(s));
}

export async function readSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as WidgetSnapshot) : null;
  } catch {
    return null;
  }
}
