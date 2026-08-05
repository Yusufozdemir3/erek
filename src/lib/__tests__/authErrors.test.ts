// translateAuthError: Supabase'in İngilizce hata mesajlarını i18n anahtarına eşler.
// Asıl konu son satırdaki eski geniş kural — bkz. o testin açıklaması.

import { translateAuthError } from '../authErrors';

const t = (key: string) => key; // dublör: anahtarı aynen döndürür

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

  // Eski kural `m.includes('invalid')` idi ve sıfırlama koduyla hiç ilgisi
  // olmayan bir "invalid ..." mesajını da yanlışlıkla "kod geçersiz" gösterirdi.
  it('sıfırlama akışıyla İLGİSİZ bir "invalid" mesajını yanlış eşlemez', () => {
    const result = translateAuthError(new Error('Invalid request payload'), t);
    expect(result).not.toBe('account.errCodeInvalid');
    // Bilinen hiçbir kalıba uymuyor — ham mesaj olduğu gibi gösterilir (translate()
    // ile aynı "son çare" felsefesi: boş metin yerine anlaşılır bir şey).
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
