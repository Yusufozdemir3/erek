// Timer engine — SHARED (Phase C: standalone timer) by both timer-type habits
// (kind='timer') and duration-based numeric goals (unit=TIME_UNIT, see
// helpers.ts). Only one timer runs at a time — regardless of type/target. The
// running state is kept in AsyncStorage, so even if the app is closed/backgrounded,
// time is tracked by real wall-clock time (computed from the startedAt timestamp).
// On pause/finish, the accumulated seconds are written to the right place: habit
// → habitRepo.incrementAmount (habit_logs.amount), goal → goalRepo.addProgress
// (current_value + goal_entries, tempo/projection benefit automatically). Once
// the target is reached it's COUNTED as completed (ratio caps at 1) BUT the
// timer does NOT stop and the counter isn't clamped either — the user can keep
// working past the target, and the extra time is honestly recorded too
// (celebratedRef ensures a one-time-per-session commit+haptic+notification-cancel).
// The notification is scheduled for the target moment.
//
// SQLite remains the single source of truth: this module only manages the
// transient (running) state and the tick of "how much time has passed right
// now"; the persistent total lives in the DB.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { goalRepo, habitRepo } from '@/db';
import { isTimeUnit, todayDate } from '@/lib/helpers';
import { notifySuccess } from '@/lib/haptics';
import { cancelTimerDone, scheduleTimerDone } from '@/lib/notifications';
// Pure time math lives in a separate module (testable); the midnight-rollover decision is there too.
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
  // Live seconds for the active target (base + elapsed, can exceed the target); null if not active.
  liveSeconds: (kind: TimerKind, id: string) => number | null;
  // Type/id of the currently running timer — for the mini status strip (see TimerStrip).
  active: () => { kind: TimerKind; id: string } | null;
  start: (kind: TimerKind, id: string) => void;
  pause: () => void;
  // Only meaningful for 'habit' (resets today's accumulation); 'goal' targets
  // keep total/persistent progress (not daily), so reset isn't supported for
  // them — a deliberate restriction to prevent accidentally wiping monthly/yearly progress.
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
  // Triggers a re-render every second. The value is NOT DISCARDED: the context
  // value below is memoized with it (see useMemo) — since the live counter
  // depends on `now`, it must refresh every tick, but renders OUTSIDE the tick
  // (e.g. when AppData state above changes) shouldn't needlessly redraw consumers.
  const [now, setNow] = useState(Date.now());
  // A ref to access the latest `active` inside intervals/async callbacks (so the closure doesn't go stale).
  const activeRef = useRef<ActiveTimer | null>(null);
  activeRef.current = active;
  // Whether this session's target-reached "celebration" (commit+haptic) has
  // already happened — so it doesn't re-fire every second. Reset on every new session in start().
  const celebratedRef = useRef(false);

  const persist = (a: ActiveTimer | null) => {
    if (a) AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(a));
    else AsyncStorage.removeItem(ACTIVE_KEY);
  };

  // Persist the active duration: add the elapsed seconds to the right place, cancel the notification.
  // `seconds` is only provided on the restore path (see restoreCommitDelta) —
  // in the normal pause/finish flow, the full running duration is written.
  const commit = useCallback((a: ActiveTimer, seconds?: number) => {
    const delta = seconds ?? commitDelta(a);
    if (delta > 0) {
      if (a.kind === 'habit') habitRepo.incrementAmount(a.targetId, a.date, delta, a.targetSeconds);
      // There used to be a separate addTimeProgress (its only difference was not
      // applying the target cap). Since addProgress's cap was removed, the two
      // became the same function and were merged into a single write path —
      // see goalRepo.addProgress.
      else goalRepo.addProgress(a.targetId, delta);
    }
    cancelTimerDone(a.targetId);
  }, []);

  const stopActive = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    // If the celebration already happened on a tick (target reached and work
    // continued), don't fire the success haptic a second time on pause.
    const reachedTarget = isFinished(a) && !celebratedRef.current;
    commit(a);
    setActive(null);
    persist(null);
    if (reachedTarget) notifySuccess(); // success haptic on reaching the target
    notifyDataChanged();
  }, [commit, notifyDataChanged]);

  // Restore persisted state on launch.
  //
  // This effect only runs when the PROCESS restarts (when the app comes from
  // background to foreground, the component is already mounted and this doesn't
  // fire). So the session here may represent a stretch of time nobody was
  // watching — the wall-clock duration can't just be written as-is (see
  // timerLogic.isStaleSession/restoreCommitDelta).
  //
  // STALE session (day changed, or the target filled up while closed): only what's
  // left up to the target is written and the session is CLOSED. This used to
  // write the entire elapsed duration and keep the timer running; an app closed
  // for two days could write 48 hours to the day the session started, and since
  // that record fell on a past day, it couldn't even be undone with "Reset".
  //
  // FRESH session (same day, target not yet reached): continues where it left
  // off as before — a brief crash/restart shouldn't disrupt the session.
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

  // Every second while active: on first reaching the target, write progress to
  // the DB + give a success haptic, but do NOT stop the timer — the counter base
  // is updated and the same session continues (past the target). Later ticks just trigger a render.
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
      // Note: can be started even if the target is already reached — the user
      // can keep going past the target (see celebratedRef).
      // Single active timer rule: if another one is running, commit it first.
      if (
        activeRef.current &&
        (activeRef.current.kind !== kind || activeRef.current.targetId !== targetId)
      ) {
        commit(activeRef.current);
        notifyDataChanged();
      }
      celebratedRef.current = base >= target; // don't re-celebrate if already completed.
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
      if (kind !== 'habit') return; // see the TimerApi.reset comment — not supported for goals
      const date = todayDate();
      // If it's running, stop it without committing (we're about to reset).
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

  // `now` is deliberately in the dependency array: the live counter reads from
  // the wall clock, so a new context value per tick is REQUIRED. The gain from
  // memoization is on renders OUTSIDE the tick (when a provider above changed
  // state, TimerProvider re-rendered too and used to produce a new object every
  // time, needlessly redrawing all consumers — HabitTimer, TimerPicker, TimerStrip).
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
