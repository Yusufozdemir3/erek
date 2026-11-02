// Finished shared items and congratulations — the pure parts (no React, no
// network): what the push payloads carry and how the app reads them, which of
// MY items just finished, and how the Edge Function's answer is shown.
// Sending lives in sync/celebrations.ts; the server rules in supabase/schema.sql
// (PHASE 7).

import type { Goal, Habit } from '@/types/models';

export type CelebrationKind = 'habit' | 'goal' | 'task';

export interface CelebrationTarget {
  type: 'finished' | 'congrats' | 'invite' | 'group_done';
  kind: CelebrationKind;
  itemId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCelebrationData(data: unknown): boolean {
  const type = data && typeof data === 'object' ? (data as Record<string, unknown>).type : null;
  return type === 'finished' || type === 'congrats' || type === 'invite' || type === 'group_done';
}

// Same trust rules as a nudge tap (lib/nudgePayload.ts): a well-formed payload
// addressed to the account signed in on THIS device, otherwise null.
export function parseCelebrationData(data: unknown, recipientUid: string | null): CelebrationTarget | null {
  if (!isCelebrationData(data) || !recipientUid) return null;
  const d = data as Record<string, unknown>;
  if (d.to !== recipientUid) return null;
  if (d.kind !== 'habit' && d.kind !== 'goal' && d.kind !== 'task') return null;
  if (typeof d.itemId !== 'string' || !UUID.test(d.itemId)) return null;
  // "Finished" notices only exist for habits and goals.
  if (d.type === 'finished' && d.kind === 'task') return null;
  // Shared-habit pushes are about habits only.
  if ((d.type === 'invite' || d.type === 'group_done') && d.kind !== 'habit') return null;
  return { type: d.type as CelebrationTarget['type'], kind: d.kind, itemId: d.itemId };
}

// Where a tapped push opens: the friend's finished item (they can congratulate
// there), or my own item when somebody congratulated me.
export function celebrationRoute(target: CelebrationTarget): string | null {
  // An invitation opens the founder's shared habit (where Join is); "everyone finished" opens
  // my own copy at its group section.
  if (target.type === 'invite') return `/shared-habit/${target.itemId}`;
  if (target.type === 'group_done') return `/habit/${target.itemId}?section=group`;
  if (target.type === 'finished') {
    return target.kind === 'task' ? null : `/shared-${target.kind}/${target.itemId}`;
  }
  return target.kind === 'task' ? null : `/${target.kind}/${target.itemId}`;
}

// The Edge Function's answer to a congratulation, as the button shows it.
export type CongratsOutcome = 'sent' | 'already' | 'dailyLimit' | 'noDevice' | 'notFinished' | 'failed';

export function congratsOutcome(status: unknown): CongratsOutcome {
  switch (status) {
    case 'sent':
      return 'sent';
    case 'already':
      return 'already';
    case 'rate_limited':
      return 'dailyLimit';
    case 'no_device':
      return 'noDevice';
    case 'not_finished':
      return 'notFinished';
    default:
      return 'failed'; // forbidden, unauthorized, error, network…
  }
}

// ---- Which of MY items finished ----------------------------------------------

// Only recently finished items are announced: older ones were either announced
// already or finished before this feature existed (nobody gets a surprise
// notice about something from months ago).
export const RECENT_DAYS = 3;

export interface FinishedCandidate {
  kind: 'habit' | 'goal';
  id: string;
  // Changes if the item is finished again later, so a re-finished goal can be
  // announced once more.
  key: string;
}

const DAY = 24 * 3600 * 1000;

function ymdAddDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function finishedCandidates(
  goals: Pick<Goal, 'id' | 'goal_type' | 'target_value' | 'current_value' | 'completed_at'>[],
  habits: Pick<Habit, 'id' | 'end_date'>[],
  today: string, // local "YYYY-MM-DD"
  now: number = Date.now()
): FinishedCandidate[] {
  const out: FinishedCandidate[] = [];
  for (const g of goals) {
    if (!g.completed_at) continue;
    if (g.goal_type === 'numeric' && !((g.target_value ?? 0) > 0 && g.current_value >= (g.target_value ?? 0))) continue;
    const at = Date.parse(g.completed_at);
    if (!Number.isFinite(at) || now - at > RECENT_DAYS * DAY) continue;
    out.push({ kind: 'goal', id: g.id, key: `goal:${g.id}:${g.completed_at}` });
  }
  const oldest = ymdAddDays(today, -RECENT_DAYS);
  for (const h of habits) {
    // Over once the end date has passed (see HABIT_ARCHIVED in db/archive.ts).
    if (!h.end_date || h.end_date >= today || h.end_date < oldest) continue;
    out.push({ kind: 'habit', id: h.id, key: `habit:${h.id}:${h.end_date}` });
  }
  return out;
}

// Statuses after which an item needn't be asked about again. NOT 'forbidden':
// a function that wasn't redeployed yet answers "finished" requests as if they
// were reminders (forbidden), and that must not mark the item as announced for
// good.
export function finishedSettled(status: unknown): boolean {
  return status === 'ok' || status === 'nobody';
}
