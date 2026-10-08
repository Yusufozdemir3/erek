// Pure helpers for the running-timer notification (lib/timerNotification.ts).

import type { TimerKind } from '@/lib/timerLogic';

// Tapping the notification body opens the habit / goal being timed.
export function timerOpenUri(kind: TimerKind, id: string): string {
  return `habitapp://${kind}/${encodeURIComponent(id)}`;
}

// A button press made on the notification while the app wasn't looking.
// `at` is when it was pressed (epoch ms): the time is booked up to THEN.
export type NativeTimerAction =
  | { op: 'pause' | 'finish'; at: number }
  | { op: 'resume'; at: number; kind: TimerKind; id: string };

// Parses the native queue (a JSON array, oldest first); anything malformed is dropped.
export function parseNativeActions(json: string): NativeTimerAction[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: NativeTimerAction[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const { op, at, kind, id } = e as Record<string, unknown>;
    if (typeof at !== 'number' || !Number.isFinite(at)) continue;
    if (op === 'pause' || op === 'finish') out.push({ op, at });
    else if (op === 'resume' && (kind === 'habit' || kind === 'goal') && typeof id === 'string' && id) {
      out.push({ op, at, kind, id });
    }
  }
  return out;
}
