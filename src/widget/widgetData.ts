// The side that PRODUCES the home-screen widget's snapshot (the app process).
// Reads today's scheduled habits from the repo, builds a snapshot localized
// with the active theme/language, writes it to AsyncStorage, and refreshes the native widget (if present).
//
// refreshWidget(userId) is FULLY self-sufficient: it reads language and theme
// from AsyncStorage itself (no React context needed) — so it can be called
// from anywhere with a single argument (the same pattern as notifications.ts's getStoredLang/translate).
//
// EXPO GO SAFETY: react-native-android-widget is only loaded via a lazy
// require, inside try/catch. Expo Go has no native module; the barrel import
// could throw there, so the snapshot is always written, but the native update is only attempted in a real (Android) build.

import { Appearance, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { habitRepo, taskRepo } from '@/db';
import { refreshTaskReminders } from '@/lib/notifications';
import { isScheduledOn, isWithinHabitDates, todayDate } from '@/lib/helpers';
import { getStoredLang } from '@/i18n/I18nProvider';
import { translate } from '@/i18n/translations';
import {
  ACCENT_THEMES,
  DEFAULT_ACCENT,
  DEFAULT_HABIT_COLOR,
  PRIORITY_COLOR,
  blackColors,
  darkColors,
  lightColors,
  fullDateLabel,
  type AccentKey,
} from '@/ui/theme';
import { writeSnapshot, type WidgetColors, type WidgetSnapshot } from './widgetSnapshot';
import { applyAll, readPending, removePending, serialized } from './widgetQueue';

// More than this wouldn't fit any widget size; the snapshot stays small.
const MAX_WIDGET_TASKS = 30;

// Same AsyncStorage keys as ThemeProvider — to read the theme preference
// outside React (see src/ui/ThemeProvider.tsx).
const MODE_KEY = 'theme:mode';
const ACCENT_KEY = 'theme:accent';
const DARK_STYLE_KEY = 'theme:darkStyle';

// Resolves the active palette outside React: stored mode + accent + dark style + system scheme.
async function resolveColors(): Promise<WidgetColors> {
  const [mode, accentRaw, darkStyle] = await Promise.all([
    AsyncStorage.getItem(MODE_KEY),
    AsyncStorage.getItem(ACCENT_KEY),
    AsyncStorage.getItem(DARK_STYLE_KEY),
  ]);
  const system = Appearance.getColorScheme(); // 'light' | 'dark' | null
  const scheme: 'light' | 'dark' =
    mode === 'dark' || mode === 'light' ? mode : system === 'dark' ? 'dark' : 'light';
  const base =
    scheme === 'dark' ? (darkStyle === 'black' ? blackColors : darkColors) : lightColors;
  const accent: AccentKey =
    accentRaw && accentRaw in ACCENT_THEMES ? (accentRaw as AccentKey) : DEFAULT_ACCENT;
  const primary = ACCENT_THEMES[accent][scheme].primary;
  return {
    bg: base.bg,
    card: base.card,
    text: base.text,
    muted: base.muted,
    faint: base.faint,
    primary,
    done: base.done,
    border: base.border,
    onAccent: base.onAccent,
  };
}

// Builds the widget snapshot from today's state of habits scheduled for today
// (frequency + life range). Same filter logic as useTodayData.
export async function buildTodaySnapshot(userId: string): Promise<WidgetSnapshot> {
  const lang = await getStoredLang();
  const colors = await resolveColors();
  const today = todayDate();

  const scheduled = habitRepo
    .listByUser(userId)
    .filter(
      (h) =>
        isScheduledOn(h.schedule, today) && isWithinHabitDates(h.start_date, h.end_date, today)
    );
  const dayStates = habitRepo.getDayStates(
    scheduled.map((h) => h.id),
    today
  );
  const habits = scheduled.map((h) => ({
    id: h.id,
    title: h.title,
    color: h.color ?? DEFAULT_HABIT_COLOR,
    completed: dayStates[h.id]?.completed ?? false,
    kind: h.kind,
    amount: dayStates[h.id]?.amount ?? 0,
    target: h.target_amount,
    unit: h.unit,
  }));
  const doneCount = habits.filter((h) => h.completed).length;

  // Today's tasks, plus ones carried over. Someone else's shared task is checked
  // off through the server, so it isn't offered here.
  const tasks = taskRepo
    .listForToday(userId, today)
    .filter((t) => !t.shared_owner_uid)
    .slice(0, MAX_WIDGET_TASKS)
    .map((t) => ({
      id: t.id,
      title: t.title,
      color: PRIORITY_COLOR[t.priority],
      completed: t.completed_at !== null,
    }));

  return {
    date: today,
    dateLabel: fullDateLabel(today, lang),
    title: translate(lang, 'widget.title'),
    summaryLabel: translate(lang, 'widget.summary', { done: doneCount, total: habits.length }),
    emptyLabel: translate(lang, 'widget.empty'),
    summaryTemplate: translate(lang, 'widget.summary'),
    staleLabel: translate(lang, 'widget.stale'),
    counterTitle: translate(lang, 'widget.counterTitle'),
    counterEmptyLabel: translate(lang, 'widget.counterEmpty'),
    tasks,
    tasksTitle: translate(lang, 'widget.tasksTitle'),
    tasksEmptyLabel: translate(lang, 'widget.tasksEmpty'),
    doneCount,
    totalCount: habits.length,
    habits,
    colors,
  };
}

// Writes the snapshot and (on Android in a real build) re-renders the native
// widget. An error must never break the app under any circumstance: every step is defensive.
//
// Widget taps not yet drained into SQLite are laid over the fresh snapshot, so
// a refresh never briefly "un-checks" a habit the user just tapped.
export async function refreshWidget(userId: string): Promise<void> {
  let snap: WidgetSnapshot;
  try {
    snap = await serialized(async () => {
      const built = applyAll(await buildTodaySnapshot(userId), await readPending());
      await writeSnapshot(built).catch(() => {});
      return built;
    });
  } catch {
    return; // couldn't read the data — leave the widget alone
  }

  if (Platform.OS !== 'android') return;
  try {
    // Lazy: only load the package when the native module exists (dev/prod build).
    const { updateWidgets } = require('./renderWidgets');
    await updateWidgets(snap);
  } catch {
    // Expo Go, or no widget support — the snapshot was written, the native update was skipped.
  }
}

// Writes the widget taps queued by the headless handler into SQLite (see
// widgetQueue.ts). Returns how many changed the data — the caller then bumps
// dataVersion so the screens and the widget re-read. A tap for a habit that
// was deleted meanwhile, or whose kind changed, is dropped.
// Must NOT be awaited inside serialized() (it takes the same chain).
export async function drainWidgetQueue(): Promise<number> {
  return serialized(async () => {
    const pending = await readPending();
    let applied = 0;
    for (const a of pending) {
      try {
        if (a.kind === 'task') {
          const task = taskRepo.getById(a.taskId);
          // Someone else's shared task is checked off through the server, never here.
          if (!task || task.shared_owner_uid) continue;
          taskRepo.setCompleted(task.id, a.completed);
          // A recurring task jumps to its next date instead of staying completed.
          await refreshTaskReminders(task.id).catch(() => {});
          applied++;
          continue;
        }
        const habit = habitRepo.getById(a.habitId);
        if (!habit || habit.deleted_at) continue;
        if (a.kind === 'toggle' && habit.kind === 'binary') {
          habitRepo.toggleLog(habit.id, a.date, a.completed);
          applied++;
        } else if (a.kind === 'inc' && habit.kind === 'numeric') {
          habitRepo.incrementAmount(habit.id, a.date, a.delta, habit.target_amount);
          applied++;
        }
      } catch {
        // one bad entry must not block the rest; it's dropped with them
      }
    }
    await removePending(pending.map((a) => a.id));
    return applied;
  });
}
