// Uygulama kilidi: ne zaman yeniden sorulur, kimlik doğrulama sonucu ne anlama gelir.

import { LOCK_GRACE_MS, outcomeOf, shouldLockOnResume } from '../appLockLogic';

const T0 = 1_000_000;

describe('shouldLockOnResume', () => {
  it('kilit kapalıysa asla kilitlemez', () => {
    expect(shouldLockOnResume({ enabled: false, backgroundedAt: T0, now: T0 + 10 * LOCK_GRACE_MS })).toBe(false);
    expect(shouldLockOnResume({ enabled: false, backgroundedAt: null, now: T0 })).toBe(false);
  });

  it('kısa ayrılık (izin penceresi, mesaj bakmak) kilitlemez', () => {
    expect(shouldLockOnResume({ enabled: true, backgroundedAt: T0, now: T0 + 5_000 })).toBe(false);
    expect(shouldLockOnResume({ enabled: true, backgroundedAt: T0, now: T0 + LOCK_GRACE_MS - 1 })).toBe(false);
  });

  it('süre dolunca kilitler (sınır dahil)', () => {
    expect(shouldLockOnResume({ enabled: true, backgroundedAt: T0, now: T0 + LOCK_GRACE_MS })).toBe(true);
    expect(shouldLockOnResume({ enabled: true, backgroundedAt: T0, now: T0 + 3_600_000 })).toBe(true);
  });

  it('bilinmeyen ayrılma zamanı ve geri alınmış saat güvenli tarafta: kilitler', () => {
    expect(shouldLockOnResume({ enabled: true, backgroundedAt: null, now: T0 })).toBe(true);
    expect(shouldLockOnResume({ enabled: true, backgroundedAt: T0, now: T0 - 5_000 })).toBe(true);
  });

  it('özel süre kullanılabilir', () => {
    expect(shouldLockOnResume({ enabled: true, backgroundedAt: T0, now: T0 + 1_000, graceMs: 500 })).toBe(true);
    expect(shouldLockOnResume({ enabled: true, backgroundedAt: T0, now: T0 + 1_000, graceMs: 5_000 })).toBe(false);
  });
});

describe('outcomeOf', () => {
  it('başarı açar', () => {
    expect(outcomeOf({ success: true })).toBe('ok');
  });

  it('iptal ve belirsiz hatalar kilitli kalır', () => {
    for (const error of ['user_cancel', 'system_cancel', 'app_cancel', 'lockout', 'authentication_failed', 'timeout', undefined, 'something_new']) {
      expect(outcomeOf({ success: false, error })).toBe('cancelled');
    }
  });

  it('telefonda ekran kilidi yoksa kullanıcı kendi uygulamasına kilitlenmez', () => {
    for (const error of ['not_enrolled', 'not_available', 'passcode_not_set', 'no_hardware']) {
      expect(outcomeOf({ success: false, error })).toBe('unavailable');
    }
  });
});
