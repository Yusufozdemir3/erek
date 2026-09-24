// Translates Supabase's English auth error messages into the user's language.
// Pure function (no React) — same rationale as timerLogic.ts / goalProjection.ts:
// keep it testable, let the screen just display the result.
// Its only caller right now is src/ui/AccountScreen.tsx (route removed, code kept).

export function translateAuthError(e: unknown, t: (key: string) => string): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return t('account.errInvalidCreds');
  if (m.includes('already registered') || m.includes('already been registered'))
    return t('account.errAlreadyRegistered');
  if (m.includes('email not confirmed')) return t('account.errEmailNotConfirmed');
  if (m.includes('password should be at least')) return t('account.errPasswordShort');
  if (m.includes('unable to validate email') || m.includes('invalid email'))
    return t('account.errInvalidEmail');
  // PASSWORD RESET CODE (verifyOtp): Supabase produces messages containing
  // "token"/"otp" in this flow (e.g. "Token has expired or is invalid"). This
  // used to also match plain `m.includes('invalid')` — which would wrongly
  // show "invalid code" for ANY "invalid ..." error unrelated to the reset
  // flow (e.g. a generic request error, or a validation issue other than
  // email verification). Now scoped only to token/otp.
  if (m.includes('token') || m.includes('otp')) return t('account.errCodeInvalid');
  if (m.includes('network')) return t('account.errNetwork');
  return msg;
}
