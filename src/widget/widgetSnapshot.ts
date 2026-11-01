// The snapshot the home-screen widgets READ, and its storage. No repo imports:
// the headless widget handler can't rely on SQLite, so it only reads this. The
// app writes it (widgetData.ts).

import AsyncStorage from '@react-native-async-storage/async-storage';

// Must match the widget names in app.json.
export const WIDGET_NAME = 'ErekToday';
export const COUNTER_WIDGET_NAME = 'ErekCounter';
export const TASKS_WIDGET_NAME = 'ErekTasks';
export const GOALS_WIDGET_NAME = 'ErekGoals';
export const QUICKADD_WIDGET_NAME = 'ErekQuickAdd';
// ErekHabitCheck, ErekHabitCount and ErekTimer are native (nativeWidgets.ts).
export const SNAPSHOT_KEY = 'widget:today';

export interface WidgetHabit {
  id: string;
  title: string;
  color: string; // the resolved color (the habit's color or the default)
  completed: boolean;
  // Missing in older snapshots: treat as 'binary'.
  kind?: 'binary' | 'numeric' | 'timer';
  amount?: number; // numeric: today's amount
  target?: number | null; // numeric: daily target
  unit?: string | null;
}

// Today's tasks (and carried-over ones), open first, today's finished ones struck through last.
export interface WidgetTask {
  id: string;
  title: string;
  color: string; // the priority color
  completed: boolean;
}

// Open goals, soonest deadline first (display only).
export interface WidgetGoal {
  id: string;
  title: string;
  percent: number; // 0-100, whole number
  percentLabel: string; // localized ("%40" / "40%")
}

// Embedded so the headless handler draws the right theme without the app.
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
  // With placeholders, so a tap can recount without the app. This and the
  // optional fields below are missing in older snapshots.
  summaryTemplate?: string;
  // Plus widgets (Counter, Tasks, Goals) show a lock card instead of content.
  locked?: boolean;
  lockedLabel?: string;
  staleLabel?: string; // shown when the snapshot is from an earlier day
  counterTitle?: string; // the counter widget's header
  counterEmptyLabel?: string; // the counter widget's text when no numeric habit is due
  todayEmptyLabel?: string; // the Today widget's text when it has neither habits nor tasks
  quickAddLabel?: string; // the quick-add widget's text
  tasks?: WidgetTask[];
  tasksTitle?: string; // the tasks widget's header
  tasksEmptyLabel?: string; // the tasks widget's text when nothing is due
  goals?: WidgetGoal[];
  goalsTitle?: string; // the goals widget's header
  goalsEmptyLabel?: string; // the goals widget's text when there is no open goal
  doneCount: number;
  totalCount: number;
  habits: WidgetHabit[];
  colors: WidgetColors;
}

// For a widget placed before the app was ever opened.
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

// Which habit each JS one-habit widget showed (widget id -> habit id), from
// before those widgets went native; carried over once (nativeWidgets.ts).
export const PICKS_KEY = 'widget:picks';

export async function readSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as WidgetSnapshot) : null;
  } catch {
    return null;
  }
}
