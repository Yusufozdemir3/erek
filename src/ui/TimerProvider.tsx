// The timer engine, shared by timer habits and duration goals (unit = TIME_UNIT).
// One timer runs at a time. Its running state is persisted, so time is
// measured by the wall clock even while the app is closed. Pause/finish books
// the seconds: habit → habitRepo.incrementAmount, goal → goalRepo.addProgress.
// Reaching the target counts as completed but doesn't stop the timer; extra
// time is recorded too. SQLite holds the totals; this only tracks the live session.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { goalRepo, habitRepo } from '@/db';
import { isTimeUnit, todayDate } from '@/lib/helpers';
import { notifySuccess } from '@/lib/haptics';
import { cancelTimerDone, scheduleTimerDone } from '@/lib/notifications';
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

const ACTIVE_KEY = 'timer:active';

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
  const [active, setActive] = useState<ActiveTimer | null>(null);
  // Ticks every second; the memoized context value depends on it.
  const [now, setNow] = useState(Date.now());
  // The latest `active` for intervals and async callbacks.
  const activeRef = useRef<ActiveTimer | null>(null);
  activeRef.current = active;
  // The target-reached commit + haptic happens once per session.
  const celebratedRef = useRef(false);

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

  const stopActive = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    // Not again if a tick already celebrated.
    const reachedTarget = isFinished(a) && !celebratedRef.current;
    commit(a);
    setActive(null);
    persist(null);
    if (reachedTarget) notifySuccess();
    notifyDataChanged();
  }, [commit, notifyDataChanged]);

  // Restore after the PROCESS restarted (a background → foreground switch
  // doesn't remount). Nobody watched the gap, so a stale session (day changed
  // or target reached) books only what was left to the target and closes; a
  // fresh one simply continues (timerLogic.isStaleSession/restoreCommitDelta).
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(ACTIVE_KEY);
      if (!raw) return;
      try {
        const a = JSON.parse(raw) as ActiveTimer;
        if (isStaleSession(a, todayDate())) {
          commit(a, restoreCommitDelta(a));
          setActive(null);
          persist(null);
          notifyDataChanged();
        } else {
          setActive(a);
        }
      } catch {
        AsyncStorage.removeItem(ACTIVE_KEY);
      }
    })();
    // first mount only
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

  const start = useCallback(
    (kind: TimerKind, targetId: string) => {
      let base: number;
      let target: number;
      let title: string;
      if (kind === 'habit') {
        const habit = habitRepo.getById(targetId);
        if (!habit || habit.kind !== 'timer' || !habit.target_amount) return;
        target = habit.target_amount;
        base = habitRepo.getAmountOn(targetId, todayDate());
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
        date: todayDate(),
        startedAt: Date.now(),
        baseSeconds: base,
        targetSeconds: target,
      };
      setActive(a);
      persist(a);
      if (base < target) scheduleTimerDone(targetId, title, target - base);
    },
    [commit, notifyDataChanged]
  );

  const pause = useCallback(() => stopActive(), [stopActive]);

  const reset = useCallback(
    (kind: TimerKind, targetId: string) => {
      if (kind !== 'habit') return;
      const date = todayDate();
      // Stop without booking anything.
      if (activeRef.current?.kind === 'habit' && activeRef.current.targetId === targetId) {
        cancelTimerDone(targetId);
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
