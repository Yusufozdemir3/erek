// The timer engine, shared by timer habits and duration goals (unit = TIME_UNIT).
// One timer runs at a time. Its running state is persisted, so time is
// measured by the wall clock even while the app is closed. Pause/finish books
// the seconds: habit → habitRepo.incrementAmount, goal → goalRepo.addProgress.
// Reaching the target counts as completed but doesn't stop the timer; extra
// time is recorded too. SQLite holds the totals; this only tracks the live session.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { goalRepo, habitRepo } from '@/db';
import { isTimeUnit, todayDate, toYmd } from '@/lib/helpers';
import { notifySuccess } from '@/lib/haptics';
import { cancelTimerDone, scheduleTimerDone } from '@/lib/notifications';
import {
  cancelTimerNotification,
  consumeNativeTimerActions,
  onNativeTimerAction,
  showTimerPaused,
  showTimerRunning,
  type TimerNotifStyle,
} from '@/lib/timerNotification';
import type { NativeTimerAction } from '@/lib/timerNotificationLogic';
import { onLocalDataWillChange } from '@/lib/localDataEvents';
import {
  commitDelta,
  elapsedOf,
  isFinished,
  isStaleSession,
  restoreCommitDelta,
  type ActiveTimer,
  type TimerKind,
} from '@/lib/timerLogic';
import { useAppData } from '@/ui/AppData';
import { DEFAULT_HABIT_COLOR } from '@/ui/theme';
import { useTheme } from '@/ui/ThemeProvider';

const ACTIVE_KEY = 'timer:active';

// Title and color the notification card shows (as TimerStrip does).
function metaOf(a: ActiveTimer): { title: string; color: string } {
  if (a.kind === 'habit') {
    const h = habitRepo.getById(a.targetId);
    return { title: h?.title ?? '', color: h?.color ?? DEFAULT_HABIT_COLOR };
  }
  return { title: goalRepo.getById(a.targetId)?.title ?? '', color: DEFAULT_HABIT_COLOR };
}

interface TimerApi {
  isRunning: (kind: TimerKind, id: string) => boolean;
  // base + elapsed (may pass the target); null if this one isn't running.
  liveSeconds: (kind: TimerKind, id: string) => number | null;
  // The running timer, for TimerStrip.
  active: () => { kind: TimerKind; id: string } | null;
  start: (kind: TimerKind, id: string) => void;
  pause: () => void;
  // Habits only (today's time); a goal's progress spans months and isn't resettable.
  reset: (kind: TimerKind, id: string) => void;
}

const TimerContext = createContext<TimerApi | null>(null);

export function useTimer(): TimerApi {
  const v = useContext(TimerContext);
  if (!v) throw new Error('useTimer yalnızca <TimerProvider> içinde kullanılabilir.');
  return v;
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const { notifyDataChanged } = useAppData();
  const { colors } = useTheme();
  // The notification card follows the app theme at the moment it is posted.
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  const notifStyle = (accent: string): TimerNotifStyle => ({
    card: colorsRef.current.card,
    text: colorsRef.current.text,
    primary: colorsRef.current.primary,
    soft: colorsRef.current.primarySoft,
    onAccent: colorsRef.current.onAccent,
    accent,
  });
  const notifInfo = (a: ActiveTimer, title: string, elapsedSeconds: number) => ({
    kind: a.kind,
    id: a.targetId,
    title,
    elapsedSeconds,
    targetSeconds: a.targetSeconds,
  });
  const [active, setActive] = useState<ActiveTimer | null>(null);
  // Ticks every second; the memoized context value depends on it.
  const [now, setNow] = useState(Date.now());
  // The latest `active` for intervals and async callbacks.
  const activeRef = useRef<ActiveTimer | null>(null);
  activeRef.current = active;
  // The target-reached commit + haptic happens once per session.
  const celebratedRef = useRef(false);
  // Restore from storage is done; before that, presses are replayed by the restore itself.
  const restoredRef = useRef(false);

  const persist = (a: ActiveTimer | null) => {
    if (a) AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(a));
    else AsyncStorage.removeItem(ACTIVE_KEY);
  };

  // Books the session's seconds and cancels its notification. `seconds` only
  // on restore (restoreCommitDelta); otherwise the full running time.
  const commit = useCallback((a: ActiveTimer, seconds?: number) => {
    const delta = seconds ?? commitDelta(a);
    if (delta > 0) {
      // The habit may be gone (deleted, wiped): its log would fail the foreign
      // key inside a handler and crash a release build. A missing goal is ignored by addProgress.
      if (a.kind === 'habit') {
        if (habitRepo.getById(a.targetId)) {
          habitRepo.incrementAmount(a.targetId, a.date, delta, a.targetSeconds);
        }
      }
      else goalRepo.addProgress(a.targetId, delta);
    }
    cancelTimerDone(a.targetId);
  }, []);

  // Books and stops the running timer. `at`: when the user actually pressed
  // the button (a notification press the app learned of later). `quiet`: the
  // notification card was already handled natively (Pause / Finish there).
  // In-app pause leaves the card frozen, with a play button.
  const stopActive = useCallback((opts: { at?: number; quiet?: boolean } = {}) => {
    const a = activeRef.current;
    if (!a) return;
    const at = opts.at ?? Date.now();
    // Not again if a tick already celebrated.
    const reachedTarget = isFinished(a, at) && !celebratedRef.current;
    const total = elapsedOf(a, at);
    const meta = metaOf(a);
    commit(a, commitDelta(a, at));
    if (!opts.quiet) showTimerPaused(notifInfo(a, meta.title, total), notifStyle(meta.color));
    activeRef.current = null;
    setActive(null);
    persist(null);
    if (reachedTarget) notifySuccess();
    notifyDataChanged();
  }, [commit, notifyDataChanged]);

  // Restore after the PROCESS restarted (a background → foreground switch
  // doesn't remount). Nobody watched the gap, so a stale session (day changed
  // or target reached) books only what was left to the target and closes; a
  // fresh one simply continues (timerLogic.isStaleSession/restoreCommitDelta).
  // Notification-button presses made while the app was not looking are replayed
  // FIRST, at the moments they happened, so a pause pressed with the screen off
  // books exactly up to then (not up to now).
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(ACTIVE_KEY);
        if (raw) {
          try {
            activeRef.current = JSON.parse(raw) as ActiveTimer;
          } catch {
            AsyncStorage.removeItem(ACTIVE_KEY);
          }
        }
        applyNativeActions(consumeNativeTimerActions());
        const a = activeRef.current;
        if (!a) return;
        if (isStaleSession(a, todayDate())) {
          commit(a, restoreCommitDelta(a));
          activeRef.current = null;
          setActive(null);
          persist(null);
          cancelTimerNotification();
          notifyDataChanged();
        } else {
          setActive(a);
          // The user may have swiped it away, or the phone rebooted.
          const meta = metaOf(a);
          showTimerRunning(notifInfo(a, meta.title, elapsedOf(a)), notifStyle(meta.color));
        }
      } finally {
        restoredRef.current = true;
      }
    })();
    // first mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Presses made while the process is alive: right away, and on every foreground.
  useEffect(() => {
    const drain = () => {
      if (restoredRef.current) applyNativeActions(consumeNativeTimerActions());
    };
    const off = onNativeTimerAction(drain);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') drain();
    });
    return () => {
      off();
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Before local data is replaced (lib/localDataEvents.ts): book the seconds
  // while the id still exists, and close the session.
  useEffect(
    () =>
      onLocalDataWillChange(() => {
        const a = activeRef.current;
        if (!a) return;
        commit(a);
        activeRef.current = null;
        setActive(null);
        persist(null);
        cancelTimerNotification();
      }),
    [commit]
  );

  // Each second: the first time the target is reached, book the progress and
  // celebrate, then keep running from the new base.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const a = activeRef.current;
      if (!a) return;
      if (!celebratedRef.current && isFinished(a)) {
        celebratedRef.current = true;
        commit(a);
        notifySuccess();
        notifyDataChanged();
        const updated: ActiveTimer = { ...a, baseSeconds: elapsedOf(a), startedAt: Date.now() };
        activeRef.current = updated;
        setActive(updated);
        persist(updated);
      } else {
        setNow(Date.now());
      }
    }, 1000);
    return () => clearInterval(id);
  }, [active, commit, notifyDataChanged]);

  // `at`: when it really started (a Resume pressed on the notification); `quiet`: its card is already up.
  const startAt = useCallback(
    (kind: TimerKind, targetId: string, at: number = Date.now(), quiet = false) => {
      const date = toYmd(new Date(at));
      let base: number;
      let target: number;
      let title: string;
      if (kind === 'habit') {
        const habit = habitRepo.getById(targetId);
        if (!habit || habit.kind !== 'timer' || !habit.target_amount) return;
        target = habit.target_amount;
        base = habitRepo.getAmountOn(targetId, date);
        title = habit.title;
      } else {
        const goal = goalRepo.getById(targetId);
        if (!goal || goal.goal_type !== 'numeric' || !isTimeUnit(goal.unit) || !goal.target_value) return;
        target = goal.target_value;
        base = goal.current_value;
        title = goal.title;
      }
      // May start past the target. Another running timer is committed first.
      if (
        activeRef.current &&
        (activeRef.current.kind !== kind || activeRef.current.targetId !== targetId)
      ) {
        commit(activeRef.current);
        notifyDataChanged();
      }
      celebratedRef.current = base >= target;
      const a: ActiveTimer = {
        kind,
        targetId,
        date,
        startedAt: at,
        baseSeconds: base,
        targetSeconds: target,
      };
      activeRef.current = a;
      setActive(a);
      persist(a);
      const gap = (Date.now() - at) / 1000;
      if (base < target && target - base - gap > 0) scheduleTimerDone(targetId, title, target - base - gap);
      if (!quiet) showTimerRunning(notifInfo(a, title, base), notifStyle(metaOf(a).color));
    },
    [commit, notifyDataChanged]
  );

  const start = useCallback((kind: TimerKind, targetId: string) => startAt(kind, targetId), [startAt]);
  const pause = useCallback(() => stopActive(), [stopActive]);

  // Replays notification-button presses oldest first (the card is already updated natively).
  const applyNativeActions = (actions: NativeTimerAction[]) => {
    for (const x of actions) {
      if (x.op === 'resume') startAt(x.kind, x.id, x.at, true);
      else stopActive({ at: x.at, quiet: true });
    }
  };

  const reset = useCallback(
    (kind: TimerKind, targetId: string) => {
      if (kind !== 'habit') return;
      const date = todayDate();
      // Stop without booking anything.
      if (activeRef.current?.kind === 'habit' && activeRef.current.targetId === targetId) {
        cancelTimerDone(targetId);
        cancelTimerNotification();
        setActive(null);
        persist(null);
      }
      const current = habitRepo.getAmountOn(targetId, date);
      if (current > 0) {
        const habit = habitRepo.getById(targetId);
        habitRepo.incrementAmount(targetId, date, -current, habit?.target_amount ?? null);
      }
      notifyDataChanged();
    },
    [notifyDataChanged]
  );

  // A new value every tick (`now`), but not on unrelated parent re-renders.
  const api = useMemo<TimerApi>(() => {
    const isRunning = (kind: TimerKind, id: string) =>
      active?.kind === kind && active?.targetId === id;
    return {
      isRunning,
      liveSeconds: (kind, id) => (isRunning(kind, id) ? elapsedOf(active!, now) : null),
      active: () => (active ? { kind: active.kind, id: active.targetId } : null),
      start,
      pause,
      reset,
    };
  }, [active, now, start, pause, reset]);

  return <TimerContext.Provider value={api}>{children}</TimerContext.Provider>;
}
