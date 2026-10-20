// Pure parts of the send-nudge Edge Function (no Deno APIs, no imports), so
// they're unit-tested from the app's Jest suite
// (src/sync/__tests__/sendNudgeLogic.test.ts).

export type NudgeKind = 'habit' | 'goal';
// What a request asks for: a reminder to the item's owner (default), the
// owner telling the people it is shared with that it is finished, or a friend
// congratulating the owner of a finished item (goals, habits and tasks).
export type Action = 'nudge' | 'finished' | 'congrats';
export type CelebrationKind = 'habit' | 'goal' | 'task';
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
  data: { type: 'nudge' | 'finished' | 'congrats'; kind: CelebrationKind; itemId: string; to: string };
}

export interface PreparedFinished {
  status: string;
  sender_name?: string | null;
  item_title?: string | null;
  recipients?: { recipient: string; tokens: { token: string; locale: Locale }[] }[];
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

export interface ParsedRequest {
  action: Action;
  kind: CelebrationKind;
  itemId: string;
}

export function parseRequest(body: unknown): ParsedRequest | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const action: Action | null =
    b.action === undefined || b.action === 'nudge'
      ? 'nudge'
      : b.action === 'finished' || b.action === 'congrats'
        ? b.action
        : null;
  if (!action) return null;
  // Reminders and "finished" notices are for habits and goals; only a
  // congratulation may also be for a (finished) task.
  const allowed: CelebrationKind[] = action === 'congrats' ? ['habit', 'goal', 'task'] : ['habit', 'goal'];
  const kind = allowed.find((k) => k === b.kind) ?? null;
  const itemId = typeof b.itemId === 'string' && UUID.test(b.itemId) ? b.itemId : null;
  return kind && itemId ? { action, kind, itemId } : null;
}

// Title = WHO reminded you; body = WHAT (the item's title). On a locked screen
// the Android channel (lockscreenVisibility PRIVATE) replaces both with the
// system's "contents hidden" text; after unlock the full text shows.
const TITLE: Record<Locale, (name: string | null) => string> = {
  tr: (n) => `${n ?? 'Bir arkadaşın'} sana bir hatırlatma gönderdi`,
  en: (n) => `${n ?? 'A friend'} sent you a reminder`,
  de: (n) => `${n ?? 'Ein Freund'} hat dir eine Erinnerung geschickt`,
};

// "Ada finished <item>" (to the people it is shared with) and "Ada
// congratulated you" (to the owner). The item's title goes in the body.
const FINISHED_TITLE: Record<Locale, (n: string | null) => string> = {
  tr: (n) => `${n ?? 'Bir arkadaşın'} paylaştığı bir şeyi tamamladı 🎉`,
  en: (n) => `${n ?? 'A friend'} finished something they shared 🎉`,
  de: (n) => `${n ?? 'Ein Freund'} hat etwas Geteiltes geschafft 🎉`,
};
const CONGRATS_TITLE: Record<Locale, (n: string | null) => string> = {
  tr: (n) => `${n ?? 'Bir arkadaşın'} seni tebrik etti 🎉`,
  en: (n) => `${n ?? 'A friend'} congratulated you 🎉`,
  de: (n) => `${n ?? 'Ein Freund'} gratuliert dir 🎉`,
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
  return messagesFor('nudge', TITLE, prep, prep.recipient ?? '', prep.tokens ?? [], kind, itemId);
}

// Congratulation to the owner (same shape as a nudge, other wording).
export function buildCongratsMessages(prep: PreparedNudge, kind: CelebrationKind, itemId: string): ExpoMessage[] {
  return messagesFor('congrats', CONGRATS_TITLE, prep, prep.recipient ?? '', prep.tokens ?? [], kind, itemId);
}

// "Finished" notices: one batch of messages for every recipient.
export function buildFinishedMessages(prep: PreparedFinished, kind: NudgeKind, itemId: string): ExpoMessage[] {
  return (prep.recipients ?? []).flatMap((r) =>
    messagesFor('finished', FINISHED_TITLE, prep, r.recipient, r.tokens, kind, itemId)
  );
}

function messagesFor(
  type: ExpoMessage['data']['type'],
  titles: Record<Locale, (name: string | null) => string>,
  prep: { sender_name?: string | null; item_title?: string | null },
  recipient: string,
  tokens: { token: string; locale: Locale }[],
  kind: CelebrationKind,
  itemId: string
): ExpoMessage[] {
  const name = firstName(prep.sender_name);
  const item = (prep.item_title ?? '').replace(/\s+/g, ' ').trim().slice(0, BODY_MAX);
  return tokens.map((t) => ({
    to: t.token,
    title: (titles[t.locale] ?? titles.en)(name),
    body: item || 'Erek',
    sound: 'default',
    priority: 'high',
    channelId: NUDGE_CHANNEL_ID,
    ttl: TTL_SECONDS,
    data: { type, kind, itemId, to: recipient },
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
