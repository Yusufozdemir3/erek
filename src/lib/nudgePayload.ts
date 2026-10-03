// What a friend-nudge push carries (built by the send-nudge Edge Function) and
// how the app reads it. Everything in a push payload is untrusted input: the
// tap router acts only on a well-formed payload addressed to the account
// signed in on this device, and then only opens the item if it exists locally.

// Android channel nudges arrive on — must match NUDGE_CHANNEL_ID in
// supabase/functions/send-nudge/logic.ts.
export const NUDGE_CHANNEL_ID = 'friend-nudge-v2';

export interface NudgeTarget {
  kind: 'habit' | 'goal';
  itemId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isNudgeData(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as Record<string, unknown>).type === 'nudge';
}

// null = not a nudge, malformed, or meant for another account (e.g. the one
// that was signed in on this phone before).
export function parseNudgeData(data: unknown, recipientUid: string | null): NudgeTarget | null {
  if (!isNudgeData(data) || !recipientUid) return null;
  const d = data as Record<string, unknown>;
  if (d.to !== recipientUid) return null;
  if (d.kind !== 'habit' && d.kind !== 'goal') return null;
  if (typeof d.itemId !== 'string' || !UUID.test(d.itemId)) return null;
  return { kind: d.kind, itemId: d.itemId };
}

// The Edge Function's answer, as the "remind your friend" button shows it.
export type NudgeOutcome = 'sent' | 'alreadyToday' | 'dailyLimit' | 'noDevice' | 'failed';

export function nudgeOutcome(status: unknown): NudgeOutcome {
  switch (status) {
    case 'sent':
      return 'sent';
    case 'rate_limited_item':
      return 'alreadyToday';
    case 'rate_limited':
      return 'dailyLimit';
    case 'no_device':
      return 'noDevice';
    default:
      return 'failed'; // forbidden, unauthorized, error, network…
  }
}
