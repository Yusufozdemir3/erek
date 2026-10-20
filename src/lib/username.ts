// Username rules, mirrored by public.set_username in supabase/schema.sql
// (the server is the authority; this only gives instant feedback).

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 20;

export type UsernameCheck = 'ok' | 'tooShort' | 'tooLong' | 'badChars';

export function checkUsername(raw: string): UsernameCheck {
  const name = raw.trim();
  if ([...name].length < USERNAME_MIN) return 'tooShort';
  if ([...name].length > USERNAME_MAX) return 'tooLong';
  // Control characters, and '@' / '#' (they would look like an e-mail / the hidden tag).
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f@#]/.test(name)) return 'badChars';
  return 'ok';
}
