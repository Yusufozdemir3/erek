// Error contract for the friends/sharing RPCs (see the FRIENDS / SHARING
// section of supabase/schema.sql). The server reports expected failures as a
// machine-readable `ERK_*` code, never as prose; this module maps them — plus
// network failures — to i18n keys so raw Postgres text never reaches the user.

export const SHARING_ERROR_CODES = [
  'ERK_AUTH',
  'ERK_RATE_LIMITED',
  'ERK_INVITE_INVALID',
  'ERK_INVITE_SELF',
  'ERK_ALREADY_CONNECTED',
  'ERK_CONNECTION_LIMIT',
  'ERK_NOT_SHARED',
  'ERK_HABIT_NOT_SYNCED',
  'ERK_GOAL_NOT_SYNCED',
  'ERK_NOT_CONNECTED',
  'ERK_SHARE_LIMIT',
  'ERK_INVALID_AMOUNT',
  'ERK_CORRECTION_LIMIT',
  'ERK_NETWORK',
  'ERK_UNKNOWN',
] as const;

export type SharingErrorCode = (typeof SHARING_ERROR_CODES)[number];

export class SharingError extends Error {
  constructor(public readonly code: SharingErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'SharingError';
  }
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  // supabase-js returns PostgrestError as a plain object, not an Error.
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

export function toSharingError(e: unknown): SharingError {
  if (e instanceof SharingError) return e;
  const msg = messageOf(e);
  const known = SHARING_ERROR_CODES.find((c) => msg.includes(c));
  if (known) return new SharingError(known);
  if (/network request failed|failed to fetch|network error|timeout/i.test(msg)) {
    return new SharingError('ERK_NETWORK', msg);
  }
  return new SharingError('ERK_UNKNOWN', msg);
}

export function sharingErrorKey(e: unknown): string {
  return `friends.err.${toSharingError(e).code}`;
}
