// Full-screen (interstitial) AdMob ads.
//
// Shown only when the app comes to the foreground (cold start included), at
// most once per INTERSTITIAL_MIN_GAP_MS, and never on the very first launch
// (adsLogic.shouldShowInterstitial). Never after completing something: that
// moment is the app's positive feedback, so ads stay out of the check-off paths.
//
// The ad unit comes from EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT_ID; without it
// Google's public TEST unit is used (works, earns nothing).
//
// GDPR/UMP consent is gathered BEFORE the SDK initializes, as Google requires;
// the form itself is configured in the AdMob dashboard.
//
// Without the native module (Expo Go, an older build) the layer stays inactive.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAdsRemoved } from '@/plus/plusStore';
import { INTERSTITIAL_MIN_GAP_MS, shouldShowInterstitial } from './adsLogic';

const LAST_SHOWN_KEY = 'ads:lastInterstitialShownAt';

// Google's public test unit.
const TEST_INTERSTITIAL_UNIT_ID = 'ca-app-pub-3940256099942544/1033173712';
const INTERSTITIAL_UNIT_ID =
  process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT_ID || TEST_INTERSTITIAL_UNIT_ID;

// eslint-disable-next-line @typescript-eslint/no-var-requires
type NativeAdsModule = typeof import('react-native-google-mobile-ads');

function loadNative(): NativeAdsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-google-mobile-ads');
  } catch {
    return null; // Expo Go / native module not yet compiled
  }
}

let initPromise: Promise<void> | null = null;

// Consent first, then the SDK. Concurrent calls share one promise.
function ensureInitialized(native: NativeAdsModule): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await native.AdsConsent.gatherConsent();
      await native.MobileAds().initialize();
    })();
  }
  return initPromise;
}

// Called on every foreground (ui/AppData.tsx). Enforces the frequency limit
// itself (persisted across restarts). Never rejects.
export async function maybeShowInterstitial(): Promise<void> {
  if (isAdsRemoved()) return; // Plus or the ads-free purchase
  const native = loadNative();
  if (!native) return;

  try {
    const now = Date.now();
    const stored = await AsyncStorage.getItem(LAST_SHOWN_KEY);
    const lastShownAt = stored ? Number(stored) : null;

    if (!shouldShowInterstitial(lastShownAt, now, INTERSTITIAL_MIN_GAP_MS)) {
      // First launch: start the clock without showing an ad.
      if (lastShownAt === null) await AsyncStorage.setItem(LAST_SHOWN_KEY, String(now));
      return;
    }

    await ensureInitialized(native);

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const ad = native.InterstitialAd.createForAdRequest(INTERSTITIAL_UNIT_ID);
      const unsubLoaded = ad.addAdEventListener(native.AdEventType.LOADED, () => {
        // Stamped at load time, so the next foreground doesn't start a second load.
        AsyncStorage.setItem(LAST_SHOWN_KEY, String(Date.now())).catch(() => {});
        ad.show().catch(() => finish());
      });
      const unsubClosed = ad.addAdEventListener(native.AdEventType.CLOSED, () => {
        unsubLoaded();
        unsubClosed();
        unsubError();
        finish();
      });
      const unsubError = ad.addAdEventListener(native.AdEventType.ERROR, () => {
        unsubLoaded();
        unsubClosed();
        unsubError();
        finish();
      });

      ad.load();
      // An ad that never loads must not hold up the caller.
      setTimeout(finish, 10_000);
    });
  } catch (e) {
    console.warn('[Reklam] Gösterilemedi:', e);
  }
}
