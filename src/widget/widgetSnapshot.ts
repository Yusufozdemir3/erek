// The snapshot type the home-screen widget READS, plus AsyncStorage access.
// This file DELIBERATELY imports no repo (expo-sqlite): the widget's
// background (headless) task handler only reads the ready-made snapshot from
// here — SQLite isn't reliable in that context. The side that PRODUCES the
// snapshot (the app process) is src/widget/widgetData.ts.

import AsyncStorage from '@react-native-async-storage/async-storage';

// Must be EXACTLY the same as the widget names defined in app.json's config plugin.
export const WIDGET_NAME = 'ErekToday';
export const COUNTER_WIDGET_NAME = 'ErekCounter';
export const TASKS_WIDGET_NAME = 'ErekTasks';
export const GOALS_WIDGET_NAME = 'ErekGoals';
export const SNAPSHOT_KEY = 'widget:today';

export interface WidgetHabit {
  id: string;
  title: string;
  color: string; // the resolved color (the habit's color or the default)
  completed: boolean;
  // Added with the tappable widgets; snapshots written by an older build lack
  // them, so readers treat a missing kind as 'binary'.
  kind?: 'binary' | 'numeric' | 'timer';
  amount?: number; // numeric: today's amount
  target?: number | null; // numeric: daily target
  unit?: string | null;
}

// A task shown on the Tasks widget: today's tasks (and those carried over),
// open ones first, the ones finished today struck through at the bottom.
export interface WidgetTask {
  id: string;
  title: string;
  color: string; // the priority color
  completed: boolean;
}

// A goal on the Goals widget (display only): open goals, soonest deadline first.
export interface WidgetGoal {
  id: string;
  title: string;
  percent: number; // 0-100, whole number
  percentLabel: string; // localized ("%40" / "40%")
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
  // "{done}/{total} completed" with the placeholders kept, so the widget can
  // recount after an optimistic tap without the app. The four fields below are
  // missing in snapshots written by an older build.
  summaryTemplate?: string;
  staleLabel?: string; // shown when the snapshot is from an earlier day
  counterTitle?: string; // the counter widget's header
  counterEmptyLabel?: string; // the counter widget's text when no numeric habit is due
  tasks?: WidgetTask[]; // missing in snapshots written by an older build
  tasksTitle?: string; // the tasks widget's header
  tasksEmptyLabel?: string; // the tasks widget's text when nothing is due
  goals?: WidgetGoal[]; // missing in snapshots written by an older build
  goalsTitle?: string; // the goals widget's header
  goalsEmptyLabel?: string; // the goals widget's text when there is no open goal
  doneCount: number;
  totalCount: number;
  habits: WidgetHabit[];
  colors: WidgetColors;
}

// The light theme used if a widget is added before the app has ever been opened (no snapshot yet).
export const FALLBACK_COLORS: WidgetColors = {
  bg: '#f8fafc',
  card: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  primary: '#2f5d45',
  done: '#10b981',
  border: '#e2e8f0',
  onAccent: '#ffffff',
};

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
