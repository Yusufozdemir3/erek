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
import { habitRepo } from '@/db';
import { isScheduledOn, isWithinHabitDates, todayDate } from '@/lib/helpers';
import { getNotificationPrefs } from '@/lib/notificationPrefs';
import { getStoredLang } from '@/i18n/I18nProvider';
import { translate } from '@/i18n/translations';
import { areFeaturesUnlocked } from '@/plus/plusStore';
import { DEFAULT_HABIT_COLOR, type Colors } from '@/ui/theme';
import {
  dueDays,
  iconSpec,
  overlayPending,
  parseNativeWidgetActions,
  picksToImport,
  type NativeBoard,
  type NativeBoardHabit,
  type NativePalette,
} from './nativeWidgetsLogic';
import { PICKS_KEY } from './widgetSnapshot';
import type { WidgetAction } from './widgetQueue';
import { readWidgetTheme, themeColors } from './widgetTheme';

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
    target: h.target_amount,
    amount: states[h.id]?.amount ?? 0,
    completed: states[h.id]?.completed ?? false,
    due: dueDays(
      today,
      (d) => isScheduledOn(h.schedule, d) && isWithinHabitDates(h.start_date, h.end_date, d, h.skip_dates)
    ),
  }));

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
    },
    habits: overlayPending(habits, today, pending),
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
