// Builds the home-screen widgets' snapshot in the app process (today's habits,
// tasks, goals; the active theme and language), stores it and re-renders the
// native widgets. Needs only a userId — language and theme are read from
// storage. The widget library is required lazily: Expo Go has no native module.

import { Appearance, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { goalMilestoneRepo, goalRepo, habitRepo, milestoneViews, taskRepo } from '@/db';
import { refreshTaskReminders } from '@/lib/notifications';
import { isScheduledOn, isWithinHabitDates, todayDate } from '@/lib/helpers';
import { getStoredLang } from '@/i18n/I18nProvider';
import { translate } from '@/i18n/translations';
import { areFeaturesUnlocked } from '@/plus/plusStore';
import {
  ACCENT_THEMES,
  DEFAULT_ACCENT,
  DEFAULT_HABIT_COLOR,
  PRIORITY_COLOR,
  blackColors,
  darkColors,
  lightColors,
  fullDateLabel,
  percentLabel,
  type AccentKey,
} from '@/ui/theme';
import { writeSnapshot, type WidgetColors, type WidgetSnapshot } from './widgetSnapshot';
import { pickGoals } from './widgetGoals';
import { applyAll, readPending, removePending, serialized } from './widgetQueue';

// More than this wouldn't fit any widget size; the snapshot stays small.
const MAX_WIDGET_TASKS = 30;

// ThemeProvider's keys, read outside React.
const MODE_KEY = 'theme:mode';
const ACCENT_KEY = 'theme:accent';
const DARK_STYLE_KEY = 'theme:darkStyle';

async function resolveColors(): Promise<WidgetColors> {
  const [mode, accentRaw, darkStyle] = await Promise.all([
    AsyncStorage.getItem(MODE_KEY),
    AsyncStorage.getItem(ACCENT_KEY),
    AsyncStorage.getItem(DARK_STYLE_KEY),
  ]);
  const system = Appearance.getColorScheme();
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

// Today's state, with the same filters as useTodayData.
export async function buildTodaySnapshot(userId: string): Promise<WidgetSnapshot> {
  const lang = await getStoredLang();
  const colors = await resolveColors();
  const today = todayDate();

  const scheduled = habitRepo
    .listByUser(userId)
    .filter(
      (h) =>
        isScheduledOn(h.schedule, today) && isWithinHabitDates(h.start_date, h.end_date, today, h.skip_dates)
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

  // Open goals for the Goals widget: numeric goals by current/target, milestone
  // goals by how many of their milestones are reached.
  const goals = pickGoals(
    goalRepo.listByUser(userId).map((g) => {
      let ratio = goalRepo.progressRatio(g);
      if (g.goal_type !== 'numeric') {
        const views = milestoneViews(goalMilestoneRepo.listByGoal(g.id), g.current_value);
        ratio = views.length > 0 ? views.filter((v) => v.reached).length / views.length : 0;
      }
      return { id: g.id, title: g.title, deadline: g.deadline, completed: goalRepo.isCompleted(g), ratio };
    })
  ).map((g) => ({ ...g, percentLabel: percentLabel(g.percent, lang) }));

  return {
    date: today,
    dateLabel: fullDateLabel(today, lang),
    title: translate(lang, 'widget.title'),
    summaryLabel: translate(lang, 'widget.summary', { done: doneCount, total: habits.length }),
    emptyLabel: translate(lang, 'widget.empty'),
    todayEmptyLabel: translate(lang, 'widget.todayEmpty'),
    quickAddLabel: translate(lang, 'widget.quickAdd'),
    pickable: habitRepo
      .listByUser(userId)
      .filter((h) => h.kind === 'binary' || h.kind === 'numeric')
      .map((h) => ({
        id: h.id,
        title: h.title,
        color: h.color ?? DEFAULT_HABIT_COLOR,
        kind: h.kind as 'binary' | 'numeric',
      })),
    pickTitle: translate(lang, 'widget.pickTitle'),
    pickEmptyLabel: translate(lang, 'widget.pickEmpty'),
    pickLabel: translate(lang, 'widget.pickLabel'),
    notTodayLabel: translate(lang, 'widget.notToday'),
    cancelLabel: translate(lang, 'common.cancel'),
    summaryTemplate: translate(lang, 'widget.summary'),
    locked: !areFeaturesUnlocked(),
    lockedLabel: translate(lang, 'widget.locked'),
    staleLabel: translate(lang, 'widget.stale'),
    counterTitle: translate(lang, 'widget.counterTitle'),
    counterEmptyLabel: translate(lang, 'widget.counterEmpty'),
    tasks,
    tasksTitle: translate(lang, 'widget.tasksTitle'),
    tasksEmptyLabel: translate(lang, 'widget.tasksEmpty'),
    goals,
    goalsTitle: translate(lang, 'widget.goalsTitle'),
    goalsEmptyLabel: translate(lang, 'widget.goalsEmpty'),
    doneCount,
    totalCount: habits.length,
    habits,
    colors,
  };
}

// Never throws. Taps not yet drained into SQLite are laid over the fresh
// snapshot, so a refresh never "un-checks" what the user just tapped.
export async function refreshWidget(userId: string): Promise<void> {
  let snap: WidgetSnapshot;
  try {
    snap = await serialized(async () => {
      const built = applyAll(await buildTodaySnapshot(userId), await readPending());
      await writeSnapshot(built).catch(() => {});
      return built;
    });
  } catch {
    return; // leave the widget as it is
  }

  if (Platform.OS !== 'android') return;
  try {
    const { updateWidgets } = require('./renderWidgets');
    await updateWidgets(snap);
  } catch {
    // Expo Go / no widget support: the snapshot is still written.
  }
}

// Writes the queued widget taps into SQLite (widgetQueue.ts) and returns how
// many changed something. Taps for deleted or changed habits are dropped.
// Never await it inside serialized() — it takes the same chain.
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
        // a bad entry is dropped without blocking the rest
      }
    }
    await removePending(pending.map((a) => a.id));
    return applied;
  });
}
