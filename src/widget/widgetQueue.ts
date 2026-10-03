// Taps on the home-screen widgets (check off a habit, +1 on a counter) and the
// queue that carries them to the app.
//
// The headless widget handler must not touch SQLite (see widgetSnapshot.ts),
// so a tap does two things there, both in AsyncStorage only:
//   1. appends an action to the pending queue (PENDING_KEY),
//   2. applies the same action to the stored snapshot, so the widget redraws
//      with the new state right away (optimistic).
// The app process later DRAINS the queue into SQLite (widgetData.drainWidgetQueue):
// immediately if its JS is alive (the handler then runs in the same runtime and
// the listener below fires), otherwise on the next launch/foreground.
//
// A toggle stores the TARGET state (completed: true/false), not "flip": applying
// it twice is harmless. +1 is a delta; it's removed from the queue right after
// it's applied.
//
// Like widgetSnapshot.ts this file imports no repo — the handler loads it.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetHabit, WidgetSnapshot } from './widgetSnapshot';

export const PENDING_KEY = 'widget:pending';

// clickAction names used by the widgets' rows/buttons.
export const TOGGLE_ACTION = 'TOGGLE_HABIT';
export const INC_ACTION = 'INC_HABIT';

export type WidgetAction =
  | { id: string; kind: 'toggle'; habitId: string; date: string; completed: boolean }
  | { id: string; kind: 'inc'; habitId: string; date: string; delta: number };

// Local calendar day, same format as helpers.todayDate (not imported: that
// module pulls in expo-crypto, which this headless-side file doesn't need).
export function localYmd(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// A snapshot from an earlier day must not take taps: its rows are yesterday's
// habits, and a tap would mark yesterday. The widget shows "open to refresh" instead.
export function isStale(snapshot: WidgetSnapshot | null, today: string = localYmd()): boolean {
  return !!snapshot && snapshot.date !== today;
}

export function habitKind(h: WidgetHabit): 'binary' | 'numeric' | 'timer' {
  return h.kind ?? 'binary';
}

function fillSummary(template: string, done: number, total: number): string {
  return template.replace('{done}', String(done)).replace('{total}', String(total));
}

// Turns a widget click into an action, based on what the snapshot shows.
// null = nothing to do (unknown click, stale snapshot, habit no longer listed,
// a toggle on a non-binary habit, +1 on a non-numeric one).
export function actionFromClick(
  snapshot: WidgetSnapshot | null,
  clickAction: string | undefined,
  data: Record<string, unknown> | undefined,
  id: string,
  today: string = localYmd()
): WidgetAction | null {
  if (!snapshot || isStale(snapshot, today)) return null;
  const habitId = typeof data?.habitId === 'string' ? data.habitId : null;
  const habit = habitId ? snapshot.habits.find((h) => h.id === habitId) : undefined;
  if (!habit) return null;
  if (clickAction === TOGGLE_ACTION && habitKind(habit) === 'binary') {
    return { id, kind: 'toggle', habitId: habit.id, date: snapshot.date, completed: !habit.completed };
  }
  if (clickAction === INC_ACTION && habitKind(habit) === 'numeric') {
    return { id, kind: 'inc', habitId: habit.id, date: snapshot.date, delta: 1 };
  }
  return null;
}

// The snapshot as it will look once the action is applied. Pure; returns the
// same object when the action doesn't concern this snapshot.
export function applyToSnapshot(snapshot: WidgetSnapshot, action: WidgetAction): WidgetSnapshot {
  if (action.date !== snapshot.date) return snapshot;
  let changed = false;
  const habits = snapshot.habits.map((h) => {
    if (h.id !== action.habitId) return h;
    changed = true;
    if (action.kind === 'toggle') return { ...h, completed: action.completed };
    const amount = Math.max(0, (h.amount ?? 0) + action.delta);
    const target = h.target ?? null;
    return { ...h, amount, completed: target != null && target > 0 && amount >= target };
  });
  if (!changed) return snapshot;
  const doneCount = habits.filter((h) => h.completed).length;
  return {
    ...snapshot,
    habits,
    doneCount,
    summaryLabel: snapshot.summaryTemplate
      ? fillSummary(snapshot.summaryTemplate, doneCount, habits.length)
      : snapshot.summaryLabel,
  };
}

export function applyAll(snapshot: WidgetSnapshot, actions: WidgetAction[]): WidgetSnapshot {
  return actions.reduce(applyToSnapshot, snapshot);
}

// — Storage —
// Every read-modify-write of the queue/snapshot goes through this chain, so two
// quick taps (or a tap during a drain) can't interleave and lose an update.
// Handler and app share one JS runtime when the app is alive, so this covers both.
let chain: Promise<unknown> = Promise.resolve();
export function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

function isAction(a: unknown): a is WidgetAction {
  const x = a as WidgetAction;
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.habitId === 'string' &&
    typeof x.date === 'string' &&
    ((x.kind === 'toggle' && typeof x.completed === 'boolean') ||
      (x.kind === 'inc' && typeof x.delta === 'number'))
  );
}

export async function readPending(): Promise<WidgetAction[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(isAction) : [];
  } catch {
    return [];
  }
}

async function writePending(list: WidgetAction[]): Promise<void> {
  if (list.length === 0) await AsyncStorage.removeItem(PENDING_KEY);
  else await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(list));
}

// Drops the given actions (the ones just applied) and keeps anything that
// arrived meanwhile.
export async function removePending(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const done = new Set(ids);
  const rest = (await readPending()).filter((a) => !done.has(a.id));
  await writePending(rest);
}

export async function appendPending(action: WidgetAction): Promise<void> {
  await writePending([...(await readPending()), action]);
}

// — In-process signal —
// The app subscribes while it's running; the handler pings after queueing, so
// the tap lands in SQLite (and on the Today screen) without waiting for a foreground.
type Listener = () => void;
const listeners = new Set<Listener>();

export function onWidgetAction(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitWidgetAction(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // a listener's error must not break the widget
    }
  });
}
