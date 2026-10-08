import { shouldShowInterstitial, isAdTransition, AD_RETURN_GRACE_MS } from '../adsLogic';

const T0 = 1_750_000_000_000;
const GAP = 30 * 60_000; // 30 minutes

describe('shouldShowInterstitial', () => {
  it('lastShownAt null iken HİÇ göstermez (ilk kurulum koruması)', () => {
    // A new install never opens with an ad.
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

describe('isAdTransition', () => {
  it('reklam açıkken ve kapandıktan hemen sonra true', () => {
    expect(isAdTransition(true, null, T0)).toBe(true);
    expect(isAdTransition(false, T0, T0 + AD_RETURN_GRACE_MS - 1)).toBe(true);
  });

  it('tolerans geçince ya da hiç reklam olmadıysa false', () => {
    expect(isAdTransition(false, T0, T0 + AD_RETURN_GRACE_MS)).toBe(false);
    expect(isAdTransition(false, null, T0)).toBe(false);
  });
});
