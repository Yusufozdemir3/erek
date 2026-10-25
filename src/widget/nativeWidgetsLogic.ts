// Pure helpers for the native widgets (Evet/Hayır, Sayaç düğmesi, Zamanlayıcı;
// Kotlin in modules/timer-notification, bridge in nativeWidgets.ts): the board
// JS publishes to them, and the taps they queue.
//
// The native side applies a tap at once and queues it; JS writes the queue
// into SQLite through the same path as the JS widgets' taps (widgetQueue.ts).
// The board carries the next days each habit is due, so the widgets roll over
// to a new day without the app.

import type { WidgetAction } from './widgetQueue';

// How many days ahead (today included) the board lists due days.
export const DUE_DAYS = 8;

// A habit icon for the native side: a glyph of the app's icon fonts by code
// point, or an old raw emoji.
export type IconSpec = { f: 'feather' | 'ionicons'; c: number } | { e: string };

export interface NativeBoardHabit {
  id: string;
  title: string;
  color: string;
  kind: 'binary' | 'numeric' | 'timer';
  icon: IconSpec | null;
  target: number | null; // numeric: daily amount · timer: seconds
  amount: number; // today (timer: seconds)
  completed: boolean;
  due: string[]; // "YYYY-MM-DD", from today on
}

export interface NativePalette {
  bg: string;
  card: string;
  text: string;
  muted: string;
  faint: string;
  primary: string;
  soft: string;
  done: string;
  border: string;
  track: string;
  onAccent: string;
}

// Translated texts the native widgets show (the widget picker names are
// Android resources; see res/values*/erek_widget_strings.xml).
export interface NativeLabels {
  pick: string;
  notToday: string;
  locked: string;
  pickTitle: string;
  pickEmpty: string;
  cancel: string;
  timersTitle: string;
  today: string; // "Bugün {time}"
  minutes: string; // "{n} dk"
  more: string; // "+{n} daha"
  noTimers: string;
  start: string;
  pause: string;
  resume: string;
  finish: string;
  // The timer card the native side posts when a timer starts from the widget.
  channelName: string;
  running: string;
  pausedTemplate: string; // "Duraklatıldı · {time}"
}

export interface NativeBoard {
  v: 1;
  date: string;
  // 'system': the native side follows the phone's dark mode by itself.
  mode: 'light' | 'dark' | 'system';
  light: NativePalette;
  dark: NativePalette;
  locked: boolean; // the Plus widgets show a lock card
  notify: boolean; // the notification switch: a timer started from the widget posts its card
  labels: NativeLabels;
  habits: NativeBoardHabit[];
  goalIcon: IconSpec | null;
}

// A habit icon id (ui/habitIcons.ts) → its glyph in the font maps. Unknown
// ids are old emoji; null stays null.
export function iconSpec(
  id: string | null | undefined,
  resolve: (id: string) => { family: 'feather' | 'ionicons'; name: string } | undefined,
  glyphs: { feather: Record<string, number>; ionicons: Record<string, number> }
): IconSpec | null {
  if (!id) return null;
  const entry = resolve(id);
  if (!entry) return { e: id };
  const c = glyphs[entry.family][entry.name];
  return typeof c === 'number' ? { f: entry.family, c } : null;
}

// "YYYY-MM-DD" plus n calendar days (local; DST-safe at noon).
export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(y, m - 1, d + n, 12);
  const p = (v: number) => String(v).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

// The days among the next DUE_DAYS (from `today`) on which `isDue` holds.
export function dueDays(today: string, isDue: (ymd: string) => boolean, n: number = DUE_DAYS): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = addDaysYmd(today, i);
    if (isDue(d)) out.push(d);
  }
  return out;
}

// JS widget taps not yet in SQLite, laid over the board (as refreshWidget does
// for the JS snapshot), so publishing never "un-taps" a habit.
export function overlayPending(
  habits: NativeBoardHabit[],
  date: string,
  pending: WidgetAction[]
): NativeBoardHabit[] {
  return pending.reduce((list, a) => {
    if (a.kind === 'task' || a.date !== date) return list;
    return list.map((h) => {
      if (h.id !== a.habitId) return h;
      if (a.kind === 'toggle') return h.kind === 'binary' ? { ...h, completed: a.completed } : h;
      if (h.kind !== 'numeric') return h;
      const amount = Math.max(0, h.amount + a.delta);
      return { ...h, amount, completed: h.target != null && h.target > 0 && amount >= h.target };
    });
  }, habits);
}

// The native queue (a JSON array, oldest first) as widget actions; anything
// malformed is dropped. Shapes: {id, kind:'toggle', habitId, date, completed}
// and {id, kind:'inc', habitId, date, delta}.
export function parseNativeWidgetActions(json: string): WidgetAction[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: WidgetAction[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const x = e as Record<string, unknown>;
    if (typeof x.id !== 'string' || typeof x.habitId !== 'string' || typeof x.date !== 'string') continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date)) continue;
    if (x.kind === 'toggle' && typeof x.completed === 'boolean') {
      out.push({ id: x.id, kind: 'toggle', habitId: x.habitId, date: x.date, completed: x.completed });
    } else if (x.kind === 'inc' && typeof x.delta === 'number' && Number.isFinite(x.delta)) {
      out.push({ id: x.id, kind: 'inc', habitId: x.habitId, date: x.date, delta: x.delta });
    }
  }
  return out;
}

// The old JS button widgets' picks (widget id → habit id), for the one-time
// hand-over to the native widgets; null when there is nothing to carry over.
export function picksToImport(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const clean: Record<string, string> = {};
    for (const [k, id] of Object.entries(v)) {
      if (/^\d+$/.test(k) && typeof id === 'string' && id) clean[k] = id;
    }
    return Object.keys(clean).length > 0 ? JSON.stringify(clean) : null;
  } catch {
    return null;
  }
}
