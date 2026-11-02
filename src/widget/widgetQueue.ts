// The queue that carries the native home-screen widgets' taps (check off a
// habit or task, +1 on a counter) to SQLite. The native side applies a tap and
// draws it at once (nativeWidgets.ts); the app process later DRAINS the queue
// into SQLite (widgetData.drainWidgetQueue): immediately when its JS is alive
// (the listener below fires), otherwise on the next launch/foreground.
//
// A toggle stores the TARGET state (completed: true/false), not "flip": applying
// it twice is harmless. +1 is a delta; it's removed from the queue right after
// it's applied.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const PENDING_KEY = 'widget:pending';

export type WidgetAction =
  | { id: string; kind: 'toggle'; habitId: string; date: string; completed: boolean }
  | { id: string; kind: 'inc'; habitId: string; date: string; delta: number }
  | { id: string; kind: 'task'; taskId: string; date: string; completed: boolean }
  // A sentence typed into the Hızlı görev card; the app makes it a task (date/time/priority parsed).
  | { id: string; kind: 'taskAdd'; title: string; date: string };

// Local calendar day, same format as helpers.todayDate (not imported: that
// module pulls in expo-crypto, which this headless-side file doesn't need).
export function localYmd(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// — Storage —
// Every read-modify-write of the queue goes through this chain, so two
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
    typeof x.date === 'string' &&
    ((x.kind === 'toggle' && typeof x.habitId === 'string' && typeof x.completed === 'boolean') ||
      (x.kind === 'inc' && typeof x.habitId === 'string' && typeof x.delta === 'number') ||
      (x.kind === 'task' && typeof x.taskId === 'string' && typeof x.completed === 'boolean') ||
      (x.kind === 'taskAdd' && typeof x.title === 'string'))
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
