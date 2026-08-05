// Supabase'in İngilizce auth hata mesajlarını kullanıcının diline çevirir.
// Saf fonksiyon (React'siz) — timerLogic.ts / goalProjection.ts ile aynı gerekçe:
// test edilebilir olsun, ekran yalnız sonucu göstersin.
// Şu an tek çağıranı src/ui/AccountScreen.tsx (rotası kaldırıldı, kod duruyor).

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
  // PAROLA SIFIRLAMA KODU (verifyOtp): Supabase bu akışta "token"/"otp" geçen
  // mesajlar üretir (ör. "Token has expired or is invalid"). Eskiden burası
  // yalın `m.includes('invalid')` de yakalıyordu — bu, sıfırlama akışıyla
  // hiç ilgisi olmayan herhangi bir "invalid ..." hatasını (ör. genel bir
  // istek hatası, e-posta doğrulama dışındaki bir doğrulama sorunu) yanlışlıkla
  // "kod geçersiz" diye gösteriyordu. Artık yalnız token/otp'ye özgü.
  if (m.includes('token') || m.includes('otp')) return t('account.errCodeInvalid');
  if (m.includes('network')) return t('account.errNetwork');
  return msg;
}
