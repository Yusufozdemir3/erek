// translateAuthError: maps Supabase's English error messages to an i18n key.
// The main subject is the old overly-broad rule near the end — see that test's description.

import { translateAuthError } from '../authErrors';

const t = (key: string) => key; // stub: returns the key as-is

describe('translateAuthError', () => {
  it('bilinen Supabase mesajlarını doğru anahtara eşler', () => {
    expect(translateAuthError(new Error('Invalid login credentials'), t)).toBe(
      'account.errInvalidCreds'
    );
    expect(translateAuthError(new Error('User already registered'), t)).toBe(
      'account.errAlreadyRegistered'
    );
    expect(translateAuthError(new Error('Email not confirmed'), t)).toBe(
      'account.errEmailNotConfirmed'
    );
    expect(translateAuthError(new Error('Password should be at least 6 characters'), t)).toBe(
      'account.errPasswordShort'
    );
    expect(translateAuthError(new Error('Unable to validate email address'), t)).toBe(
      'account.errInvalidEmail'
    );
    expect(translateAuthError(new Error('Token has expired or is invalid'), t)).toBe(
      'account.errCodeInvalid'
    );
    expect(translateAuthError(new Error('Network request failed'), t)).toBe('account.errNetwork');
  });

  // The old rule was `m.includes('invalid')`, and it would wrongly show
  // "invalid code" for an "invalid ..." message totally unrelated to the reset code.
  it('sıfırlama akışıyla İLGİSİZ bir "invalid" mesajını yanlış eşlemez', () => {
    const result = translateAuthError(new Error('Invalid request payload'), t);
    expect(result).not.toBe('account.errCodeInvalid');
    // Doesn't match any known pattern — the raw message is shown as-is (same
    // "last resort" philosophy as translate(): something understandable instead of empty text).
    expect(result).toBe('Invalid request payload');
  });

  it('yalnız "token" ya da "otp" geçen mesajlar kod-geçersiz sayılır', () => {
    expect(translateAuthError(new Error('Invalid OTP'), t)).toBe('account.errCodeInvalid');
    expect(translateAuthError(new Error('malformed token'), t)).toBe('account.errCodeInvalid');
  });

  it('bilinmeyen bir hata ham mesajı döner (boş metin göstermez)', () => {
    expect(translateAuthError(new Error('şu anda bilinmeyen bir hata'), t)).toBe(
      'şu anda bilinmeyen bir hata'
    );
  });

  it('Error olmayan fırlatmaları da String()\'e çevirip işler', () => {
    expect(translateAuthError('network timeout', t)).toBe('account.errNetwork');
  });
});
