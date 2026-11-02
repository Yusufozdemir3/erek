// Android: the native home-screen widgets (Evet/Hayır, Sayaç düğmesi,
// Zamanlayıcı — Kotlin, modules/timer-notification). A tap there is applied and
// drawn natively in milliseconds, without JS; this file feeds them:
//   - publishNativeBoard: habits, today's amounts, due days, theme, labels
//     (on every refreshWidget),
//   - consumeNativeWidgetActions: their queued taps, written to SQLite by
//     drainWidgetQueue like the JS widgets' taps (timer taps go to TimerProvider
//     through the timer notification's queue instead),
//   - patchNativeHabit: a JS widget's tap, mirrored on them.
// Everything is best-effort: a failure here must never break the app or the JS widgets.

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { goalMilestoneRepo, goalRepo, habitRepo, milestoneViews, taskRepo } from '@/db';
import { isScheduledOn, isWithinHabitDates, todayDate } from '@/lib/helpers';
import { getNotificationPrefs } from '@/lib/notificationPrefs';
import { getStoredLang } from '@/i18n/I18nProvider';
import { translate } from '@/i18n/translations';
import { areFeaturesUnlocked } from '@/plus/plusStore';
import { DEFAULT_HABIT_COLOR, PRIORITY_COLOR, percentLabel, type Colors } from '@/ui/theme';
import {
  dueDays,
  iconSpec,
  overlayPending,
  overlayPendingTasks,
  parseNativeWidgetActions,
  picksToImport,
  type NativeBoard,
  type NativeBoardHabit,
  type NativePalette,
} from './nativeWidgetsLogic';
import { pickGoals } from './widgetGoals';
import type { WidgetAction } from './widgetQueue';
import { readWidgetTheme, themeColors } from './widgetTheme';

// More than this wouldn't fit any widget size.
const MAX_TASKS = 30;

// Which habit each JS one-habit widget showed (widget id -> habit id), from
// before those widgets went native; carried over once.
export const PICKS_KEY = 'widget:picks';

interface NativeApi {
  setBoard(json: string): void;
  consumePending(): string;
  patchHabit(habitId: string, day: string, completed: boolean, amount: number): void;
  importPicks(json: string): void;
  addListener(event: 'onAction', cb: () => void): { remove(): void };
}

let native: NativeApi | null | undefined;
function loadNative(): NativeApi | null {
  if (native !== undefined) return native;
  native = null;
  if (Platform.OS === 'android') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      native = require('../../modules/timer-notification/src/ErekWidgetsModule').default as NativeApi;
    } catch {
      // Expo Go / no native module
    }
  }
  return native;
}

type Glyphs = { feather: Record<string, number>; ionicons: Record<string, number> };
type ResolveIcon = (id: string) => { family: 'feather' | 'ionicons'; name: string } | undefined;
// Loaded on first use: the icon set pulls in @expo/vector-icons (UI code).
let icons: { glyphs: Glyphs; resolve: ResolveIcon } | null = null;
function iconData(): { glyphs: Glyphs; resolve: ResolveIcon } {
  if (!icons) {
    /* eslint-disable @typescript-eslint/no-var-requires */
    icons = {
      glyphs: {
        feather: require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Feather.json'),
        ionicons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json'),
      },
      resolve: require('../ui/habitIcons').resolveHabitIcon,
    };
    /* eslint-enable @typescript-eslint/no-var-requires */
  }
  return icons!;
}

function palette(c: Colors): NativePalette {
  return {
    bg: c.bg,
    card: c.card,
    text: c.text,
    muted: c.muted,
    faint: c.faint,
    primary: c.primary,
    soft: c.primarySoft,
    done: c.done,
    border: c.border,
    track: c.track,
    onAccent: c.onAccent,
  };
}

// Every active habit (the button widgets may point at one not due today), in
// the app's order, with today's state and the next days it is due. `pending`:
// JS widget taps not in SQLite yet.
export async function buildNativeBoard(userId: string, pending: WidgetAction[]): Promise<NativeBoard> {
  const lang = await getStoredLang();
  const theme = await readWidgetTheme();
  const prefs = await getNotificationPrefs();
  const today = todayDate();
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);

  const active = habitRepo.listActive(userId, today);
  const states = habitRepo.getDayStates(
    active.map((h) => h.id),
    today
  );
  const { glyphs, resolve } = iconData();
  const habits: NativeBoardHabit[] = active.map((h) => ({
    id: h.id,
    title: h.title,
    color: h.color ?? DEFAULT_HABIT_COLOR,
    kind: h.kind,
    icon: iconSpec(h.icon, resolve, glyphs),
    unit: h.unit,
    target: h.target_amount,
    amount: states[h.id]?.amount ?? 0,
    completed: states[h.id]?.completed ?? false,
    due: dueDays(
      today,
      (d) => isScheduledOn(h.schedule, d) && isWithinHabitDates(h.start_date, h.end_date, d, h.skip_dates)
    ),
  }));

  // Today's tasks (and carried-over ones); someone else's shared task is checked off through the server.
  const tasks = taskRepo
    .listForToday(userId, today)
    .filter((x) => !x.shared_owner_uid)
    .slice(0, MAX_TASKS)
    .map((x) => ({ id: x.id, title: x.title, color: PRIORITY_COLOR[x.priority], completed: x.completed_at !== null }));

  // Open goals: numeric by current/target, milestone goals by milestones reached.
  const goals = pickGoals(
    goalRepo.listActive(userId, today).map((g) => {
      let ratio = goalRepo.progressRatio(g);
      if (g.goal_type !== 'numeric') {
        const views = milestoneViews(goalMilestoneRepo.listByGoal(g.id), g.current_value);
        ratio = views.length > 0 ? views.filter((v) => v.reached).length / views.length : 0;
      }
      return { id: g.id, title: g.title, deadline: g.deadline, completed: goalRepo.isCompleted(g), ratio };
    })
  ).map((g) => ({ ...g, percentLabel: percentLabel(g.percent, lang) }));

  return {
    v: 1,
    date: today,
    mode: theme.mode,
    light: palette(themeColors(theme, 'light')),
    dark: palette(themeColors(theme, 'dark')),
    locked: !areFeaturesUnlocked(),
    notify: prefs.enabled,
    labels: {
      pick: t('widget.pickLabel'),
      notToday: t('widget.notToday'),
      locked: t('widget.locked'),
      pickTitle: t('widget.pickTitle'),
      pickEmpty: t('widget.pickEmpty'),
      cancel: t('common.cancel'),
      timersTitle: t('widget.timersTitle'),
      today: t('widget.timersToday', { time: '{time}' }),
      minutes: t('widget.timersMinutes', { n: '{n}' }),
      more: t('widget.timersMore', { n: '{n}' }),
      noTimers: t('widget.timersEmpty'),
      start: t('widget.timersStart'),
      pause: t('timer.notifPause'),
      resume: t('timer.notifResume'),
      finish: t('timer.notifFinish'),
      channelName: t('timer.notifChannel'),
      running: t('timer.notifRunning'),
      pausedTemplate: t('timer.notifPaused', { time: '{time}' }),
      todayTitle: t('widget.title'),
      summary: t('widget.summary', { done: '{done}', total: '{total}' }),
      todayEmpty: t('widget.todayEmpty'),
      counterTitle: t('widget.counterTitle'),
      counterEmpty: t('widget.counterEmpty'),
      tasksTitle: t('widget.tasksTitle'),
      tasksEmpty: t('widget.tasksEmpty'),
      goalsTitle: t('widget.goalsTitle'),
      goalsEmpty: t('widget.goalsEmpty'),
      stale: t('widget.stale'),
      quickAdd: t('widget.quickAdd'),
      quickAddHint: t('widget.quickAddHint'),
      quickAddSave: t('widget.quickAddSave'),
      quickAddDone: t('widget.quickAddDone'),
    },
    habits: overlayPending(habits, today, pending),
    tasks: overlayPendingTasks(tasks, today, pending),
    goals,
    goalIcon: iconSpec('target', resolve, glyphs),
  };
}

export async function publishNativeBoard(userId: string, pending: WidgetAction[]): Promise<void> {
  const api = loadNative();
  if (!api) return;
  try {
    await carryOverPicks(api);
    api.setBoard(JSON.stringify(await buildNativeBoard(userId, pending)));
  } catch {
    // best-effort
  }
}

// The JS Evet/Hayır and Sayaç düğmesi widgets kept their picks in AsyncStorage;
// the native ones (same widget ids) take them over once.
async function carryOverPicks(api: NativeApi): Promise<void> {
  const raw = await AsyncStorage.getItem(PICKS_KEY);
  if (raw === null) return;
  const json = picksToImport(raw);
  if (json) api.importPicks(json);
  await AsyncStorage.removeItem(PICKS_KEY);
}

// Taps made on the native button widgets since JS last looked (oldest first). Reading clears them.
export function consumeNativeWidgetActions(): WidgetAction[] {
  try {
    const api = loadNative();
    return api ? parseNativeWidgetActions(api.consumePending()) : [];
  } catch {
    return [];
  }
}

// Told right away when a native button is tapped while the app process is alive.
export function onNativeWidgetAction(cb: () => void): () => void {
  try {
    const sub = loadNative()?.addListener('onAction', cb);
    return () => sub?.remove();
  } catch {
    return () => {};
  }
}

// A JS widget's tap (already queued in widgetQueue.ts), shown on the native buttons too.
export function patchNativeHabit(habitId: string, date: string, completed: boolean, amount: number): void {
  try {
    loadNative()?.patchHabit(habitId, date, completed, amount);
  } catch {
    // best-effort
  }
}
