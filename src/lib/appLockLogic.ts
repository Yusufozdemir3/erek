// App lock: when the app asks for the phone's screen lock again.
//
// The lock uses the PHONE's own credential (fingerprint/face, with PIN/pattern
// as the fallback) — Erek stores no PIN or biometric of its own. Pure rules
// here; lib/appLock.ts talks to the OS and ui/useAppLock.ts drives the screen.

// Coming back to the app within this window is not a new session: switching to
// a message, a permission dialog or the account picker must not lock you out.
export const LOCK_GRACE_MS = 60_000;

export interface ResumeInput {
  enabled: boolean;
  backgroundedAt: number | null; // epoch ms the app last went to the background; null = unknown
  now: number;
  graceMs?: number;
}

// Does coming back to the foreground need the credential again?
// An unknown background time locks (safe side); a clock that went backwards
// (manual time change) also locks.
export function shouldLockOnResume({ enabled, backgroundedAt, now, graceMs = LOCK_GRACE_MS }: ResumeInput): boolean {
  if (!enabled) return false;
  if (backgroundedAt === null) return true;
  const away = now - backgroundedAt;
  return away < 0 || away >= graceMs;
}

export type AuthOutcome = 'ok' | 'cancelled' | 'unavailable';

// Maps the OS authentication result to what the lock does next:
//   ok          -> unlock
//   cancelled   -> stay locked (the user can try again)
//   unavailable -> the phone has no screen lock any more (or no hardware): staying
//                  locked would trap the user in their own app, so the lock lifts
//                  and is switched off.
// Everything that isn't a clear "unavailable" counts as cancelled/failed, i.e. stays locked.
const UNAVAILABLE_ERRORS = new Set(['not_enrolled', 'not_available', 'passcode_not_set', 'no_hardware']);

export function outcomeOf(result: { success: boolean; error?: string }): AuthOutcome {
  if (result.success) return 'ok';
  return result.error && UNAVAILABLE_ERRORS.has(result.error) ? 'unavailable' : 'cancelled';
}
