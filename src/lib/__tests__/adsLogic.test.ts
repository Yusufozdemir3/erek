import { shouldShowInterstitial } from '../adsLogic';

const T0 = 1_750_000_000_000;
const GAP = 30 * 60_000; // 30 dk

describe('shouldShowInterstitial', () => {
  it('lastShownAt null iken HİÇ göstermez (ilk kurulum koruması)', () => {
    // Çağıran bu durumda timestamp'i tohumlamalı ama reklamı göstermemeli —
    // aksi halde her yeni kurulumda kullanıcı uygulamayı tanımadan tam ekran
    // reklamla karşılaşırdı.
    expect(shouldShowInterstitial(null, T0, GAP)).toBe(false);
  });

  it('aradan yeterli süre geçtiyse gösterir', () => {
    expect(shouldShowInterstitial(T0, T0 + GAP, GAP)).toBe(true);
    expect(shouldShowInterstitial(T0, T0 + GAP + 1, GAP)).toBe(true);
  });

  it('sınırın altındaysa göstermez', () => {
    expect(shouldShowInterstitial(T0, T0 + GAP - 1, GAP)).toBe(false);
  });

  it('cihaz saati geri alınmışsa (now < lastShownAt) göstermez', () => {
    expect(shouldShowInterstitial(T0, T0 - 60_000, GAP)).toBe(false);
  });

  it('tam sınırda (eşitlik) gösterir', () => {
    expect(shouldShowInterstitial(0, GAP, GAP)).toBe(true);
  });
});
