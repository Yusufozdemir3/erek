// Android: a persistent notification for the running timer, visible on the
// lock screen and drawn like the in-app TimerStrip (colored border, round icon,
// title, "clock / target", round pause button). The system chronometer counts
// the time (modules/timer-notification), so it keeps ticking with the app
// closed. Pausing leaves the same card frozen, with a play button (it times
// out on its own). Needs the master notification switch and permission;
// everything is best-effort — a failure here must never affect the timer itself.

import { Platform } from 'react-native';
import { getStoredLang } from '@/i18n/I18nProvider';
import { translate } from '@/i18n/translations';
import { fmtClock } from '@/lib/helpers';
import { getNotificationPrefs } from '@/lib/notificationPrefs';
import { ensurePermission } from '@/lib/notifications';
import { parseNativeActions, timerOpenUri, type NativeTimerAction } from '@/lib/timerNotificationLogic';
import type { TimerKind } from '@/lib/timerLogic';
import type { TimerNotificationOptions } from '../../modules/timer-notification/src/TimerNotificationModule';

// The slice of the app theme the card uses, plus the item's own color.
export interface TimerNotifStyle {
  card: string;
  text: string;
  primary: string;
  soft: string;
  onAccent: string;
  accent: string;
}

export interface TimerNotifInfo {
  kind: TimerKind;
  id: string;
  title: string;
  elapsedSeconds: number;
  targetSeconds: number;
}

interface NativeApi {
  show(opts: TimerNotificationOptions): void;
  cancel(): void;
  consumePending(): string;
  addListener(event: 'onAction', cb: () => void): { remove(): void };
}

function loadNative(): NativeApi | null {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../modules/timer-notification/src/TimerNotificationModule').default as NativeApi;
  } catch {
    return null;
  }
}

async function usable(): Promise<NativeApi | null> {
  const native = loadNative();
  if (!native) return null;
  const prefs = await getNotificationPrefs();
  if (!prefs.enabled) return null;
  return (await ensurePermission()) ? native : null;
}

async function show(running: boolean, info: TimerNotifInfo, style: TimerNotifStyle): Promise<void> {
  try {
    const native = await usable();
    if (!native) return;
    const lang = await getStoredLang();
    const elapsed = Math.max(0, info.elapsedSeconds);
    const targetText = info.targetSeconds > 0 ? fmtClock(info.targetSeconds) : '';
    // The buttons are handled natively (the app doesn't open), which also
    // renders the paused text, so the template travels with the card.
    native.show({
      channelName: translate(lang, 'timer.notifChannel'),
      title: info.title,
      kind: info.kind,
      id: info.id,
      running,
      elapsedMs: elapsed * 1000,
      targetText,
      runningText: translate(lang, 'timer.notifRunning'),
      pausedTextTemplate: translate(lang, 'timer.notifPaused', { time: '{time}' }),
      pauseLabel: translate(lang, 'timer.notifPause'),
      resumeLabel: translate(lang, 'timer.notifResume'),
      finishLabel: translate(lang, 'timer.notifFinish'),
      openUri: timerOpenUri(info.kind, info.id),
      card: style.card,
      textColor: style.text,
      primary: style.primary,
      soft: style.soft,
      onAccent: style.onAccent,
      accent: style.accent,
    });
  } catch {
    // best-effort
  }
}

export const showTimerRunning = (info: TimerNotifInfo, style: TimerNotifStyle) => show(true, info, style);
export const showTimerPaused = (info: TimerNotifInfo, style: TimerNotifStyle) => show(false, info, style);

// Button presses made on the notification since the app last looked (oldest
// first). Reading clears them.
export function consumeNativeTimerActions(): NativeTimerAction[] {
  try {
    const native = loadNative();
    return native ? parseNativeActions(native.consumePending()) : [];
  } catch {
    return [];
  }
}

// Told right away when a button is pressed while the app process is alive.
export function onNativeTimerAction(cb: () => void): () => void {
  try {
    const sub = loadNative()?.addListener('onAction', cb);
    return () => sub?.remove();
  } catch {
    return () => {};
  }
}

export function cancelTimerNotification(): void {
  try {
    loadNative()?.cancel();
  } catch {
    // best-effort
  }
}
