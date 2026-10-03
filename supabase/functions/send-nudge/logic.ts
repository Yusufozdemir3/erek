// Pure parts of the send-nudge Edge Function (no Deno APIs, no imports), so
// they're unit-tested from the app's Jest suite
// (src/sync/__tests__/sendNudgeLogic.test.ts).

export type NudgeKind = 'habit' | 'goal';
export type Locale = 'tr' | 'en' | 'de';

export interface PreparedNudge {
  status: string;
  recipient?: string;
  sender_name?: string | null;
  item_title?: string | null;
  tokens?: { token: string; locale: Locale }[];
}

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  channelId: string;
  ttl: number;
  data: { type: 'nudge'; kind: NudgeKind; itemId: string; to: string };
}

export interface ExpoTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The key that bypasses RLS. This project uses the legacy JWT keys
// (SUPABASE_SERVICE_ROLE_KEY); if those are ever switched off, the platform
// provides the new ones as SUPABASE_SECRET_KEYS = {"default":"sb_secret_…"}.
export function pickServiceKey(legacy: string | undefined, secretKeysJson: string | undefined): string | null {
  if (legacy) return legacy;
  if (!secretKeysJson) return null;
  try {
    const keys = JSON.parse(secretKeysJson) as Record<string, unknown>;
    return typeof keys?.default === 'string' && keys.default ? keys.default : null;
  } catch {
    return null;
  }
}

export function parseRequest(body: unknown): { kind: NudgeKind; itemId: string } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const kind = b.kind === 'habit' || b.kind === 'goal' ? b.kind : null;
  const itemId = typeof b.itemId === 'string' && UUID.test(b.itemId) ? b.itemId : null;
  return kind && itemId ? { kind, itemId } : null;
}

// Title = WHO reminded you; body = WHAT (the item's title). On a locked screen
// the Android channel (lockscreenVisibility PRIVATE) replaces both with the
// system's "contents hidden" text; after unlock the full text shows.
const TITLE: Record<Locale, (name: string | null) => string> = {
  tr: (n) => `${n ?? 'Bir arkadaşın'} sana bir hatırlatma gönderdi`,
  en: (n) => `${n ?? 'A friend'} sent you a reminder`,
  de: (n) => `${n ?? 'Ein Freund'} hat dir eine Erinnerung geschickt`,
};

// The first name reads friendlier than "Ada Lovelace" and is all we need.
export function firstName(displayName: string | null | undefined): string | null {
  const first = (displayName ?? '').trim().split(/\s+/)[0];
  return first ? first.slice(0, 40) : null;
}

// A NEW id whenever the channel's settings change: Android never lets an app
// modify a channel that already exists on the phone ('friend-nudge' was the
// first version, without the lock-screen setting).
export const NUDGE_CHANNEL_ID = 'friend-nudge-v2';
const BODY_MAX = 120;
// A nudge that couldn't be delivered within 12 h is stale (and the sender may
// nudge again by then).
const TTL_SECONDS = 12 * 3600;

export function buildMessages(prep: PreparedNudge, kind: NudgeKind, itemId: string): ExpoMessage[] {
  const name = firstName(prep.sender_name);
  const item = (prep.item_title ?? '').replace(/\s+/g, ' ').trim().slice(0, BODY_MAX);
  return (prep.tokens ?? []).map((t) => ({
    to: t.token,
    title: (TITLE[t.locale] ?? TITLE.en)(name),
    body: item || 'Erek',
    sound: 'default',
    priority: 'high',
    channelId: NUDGE_CHANNEL_ID,
    ttl: TTL_SECONDS,
    data: { type: 'nudge', kind, itemId, to: prep.recipient ?? '' },
  }));
}

// Tokens Expo says no longer exist on any device (app uninstalled, data
// cleared): forget them right away.
export function deadTokens(messages: ExpoMessage[], tickets: ExpoTicket[]): string[] {
  return tickets.flatMap((t, i) =>
    t.status === 'error' && t.details?.error === 'DeviceNotRegistered' && messages[i] ? [messages[i].to] : []
  );
}

// What the sender's app is told.
export function outcome(messages: ExpoMessage[], tickets: ExpoTicket[]): 'sent' | 'no_device' | 'error' {
  if (tickets.some((t) => t.status === 'ok')) return 'sent';
  if (messages.length > 0 && deadTokens(messages, tickets).length === messages.length) return 'no_device';
  return 'error';
}
