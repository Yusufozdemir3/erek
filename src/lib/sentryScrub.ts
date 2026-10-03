// What a crash report may contain. The privacy policy (§6) and the Privacy
// screen promise a technical report WITHOUT the content of habits, tasks or
// goals. The SDK's own defaults don't guarantee that: console breadcrumbs carry
// whatever the app logged, tap breadcrumbs carry the tapped element's label
// (= an item's title), and request/user blocks can carry ids or e-mail. These
// two functions drop all of that before anything leaves the phone.
//
// Pure and structural (no SDK types) so they're testable and an SDK upgrade
// can't change what they accept.

type Dict = Record<string, unknown>;

interface Breadcrumb {
  category?: string;
  type?: string;
}

interface ErrorEvent {
  user?: unknown;
  request?: unknown;
  extra?: unknown;
  contexts?: Record<string, unknown>;
  breadcrumbs?: Breadcrumb[];
  exception?: { values?: { value?: string }[] };
  message?: string;
}

// Only these breadcrumb categories survive, and only their category/timestamp/
// level — never their data (not even the route).
const KEEP_CATEGORIES = new Set(['navigation', 'app.lifecycle', 'device.orientation']);

export const MAX_MESSAGE_LEN = 300;

export function scrubBreadcrumb<T extends Breadcrumb>(b: T): T | null {
  if (!b.category || !KEEP_CATEGORIES.has(b.category)) return null;
  const { category, type, level, timestamp } = b as unknown as Dict;
  // The data bag (routes with concrete ids, messages) is dropped on purpose.
  return { category, type, level, timestamp } as unknown as T;
}

// Exception messages are written by our own code and by SQLite/the network;
// the rare one could echo a value. Capped, and anything between quotes is masked.
// "…", '…', `…`, “…”, ‘…’ — a short stretch between a matching pair.
const QUOTED = /"[^"]{1,120}"|'[^']{1,120}'|`[^`]{1,120}`|“[^”]{1,120}”|‘[^’]{1,120}’/g;

function maskMessage(s: string): string {
  return s.slice(0, MAX_MESSAGE_LEN).replace(QUOTED, (m) => `${m[0]}…${m[m.length - 1]}`);
}

export function scrubEvent<T extends ErrorEvent>(event: T): T {
  const e: ErrorEvent = { ...event };
  delete e.user;
  delete e.request;
  delete e.extra;
  if (e.contexts) {
    // Technical contexts (device, os, app, runtime) stay; anything else (free-form) goes.
    const keep = new Set(['device', 'os', 'app', 'runtime', 'culture', 'react_native_context', 'trace']);
    e.contexts = Object.fromEntries(Object.entries(e.contexts).filter(([k]) => keep.has(k)));
  }
  if (e.breadcrumbs) {
    e.breadcrumbs = e.breadcrumbs.map(scrubBreadcrumb).filter((b): b is Breadcrumb => b !== null);
  }
  if (e.exception?.values) {
    e.exception = {
      ...e.exception,
      values: e.exception.values.map((v) => (typeof v.value === 'string' ? { ...v, value: maskMessage(v.value) } : v)),
    };
  }
  if (typeof e.message === 'string') e.message = maskMessage(e.message);
  return e as T;
}
