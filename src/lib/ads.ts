// Full-screen (interstitial) ads — Google AdMob (react-native-google-mobile-ads).
//
// TRIGGER (user decision, 2026-08-04): only when the app comes to the
// FOREGROUND (including cold start), at most once per INTERSTITIAL_MIN_GAP_MS.
// DELIBERATELY NOT triggered on: a habit/task being COMPLETED. This app's
// core design is built around "completion = instant positive feedback"
// (haptics, animation, the streak/score system — see habitScore.ts). Popping
// a full-screen ad right after completion would directly undermine that loop
// and hurt retention — so the ad layer NEVER touches habitRepo/taskRepo's
// completion paths, it only hooks into AppData's foreground trigger.
//
// NO ADS AT ALL ON FIRST INSTALL: see adsLogic.shouldShowInterstitial — if
// lastShownAt was never recorded, the timer is seeded with "now" but the ad
// is NOT SHOWN; so the user doesn't hit a full-screen ad right after the
// onboarding/login screens.
//
// TEST IDS — MUST BE REPLACED BEFORE GOING LIVE:
// both `androidAppId` in app.json AND the default ad unit id below are
// Google's publicly known TEST ids (ca-app-pub-3940256099942544~...). These
// work without crashing but GENERATE NO REVENUE. Before going live:
//   1) create the app + an interstitial ad unit in the AdMob account.
//   2) replace androidAppId under app.json > plugins > "react-native-google-mobile-ads"
//      with the real App ID (this is a native manifest field — the change
//      only takes effect after a fresh `expo prebuild`).
//   3) write EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT_ID = the real ad unit id into .env.
//
// GDPR/UMP CONSENT: AdsConsent.gatherConsent() is called BEFORE the SDK is
// initialized — Google's own guideline requires this order (consent status
// must be known before an ad request is sent to an EU/UK user). The form's
// CONTENT is configured in the AdMob dashboard (Privacy & messaging); the
// code side only triggers the flow.
//
// EXPO GO / NOT-YET-COMPILED BUILD: the native module doesn't exist. Lazy
// require + try/catch (same safety pattern as
// customNotificationChannel.ts/ringtonePicker.ts elsewhere in this codebase)
// — the ad layer silently stays inactive if not found.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { shouldShowInterstitial } from './adsLogic';

const LAST_SHOWN_KEY = 'ads:lastInterstitialShownAt';
const INTERSTITIAL_MIN_GAP_MS = 30 * 60 * 1000; // 30 minutes

// Google's publicly known test ad unit id — see the note at the top of the file.
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

// Initializes the SDK, completing the GDPR/UMP consent flow BEFORE the SDK
// starts. Idempotent (concurrent calls share the same promise) — safe to call
// multiple times, both from this file and externally.
function ensureInitialized(native: NativeAdsModule): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await native.AdsConsent.gatherConsent();
      await native.MobileAds().initialize();
    })();
  }
  return initPromise;
}

// Called when the app comes to the foreground (including cold start) — see
// ui/AppData.tsx. Enforces the frequency limit on its own (persisted in
// AsyncStorage, remembered even across process restarts); the caller doesn't
// need to set up an additional gate. NEVER REJECTS UNDER ANY CONDITION: this
// is a side effect, it must not block or disrupt the user's actual flow
// (sync, data loading).
export async function maybeShowInterstitial(): Promise<void> {
  const native = loadNative();
  if (!native) return;

  try {
    const now = Date.now();
    const stored = await AsyncStorage.getItem(LAST_SHOWN_KEY);
    const lastShownAt = stored ? Number(stored) : null;

    if (!shouldShowInterstitial(lastShownAt, now, INTERSTITIAL_MIN_GAP_MS)) {
      // First check: seed the timer without showing an ad (see the note at the top of the file).
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
        // The "shown" timestamp is written at LOAD time (before show()): so
        // that a second load attempt doesn't start at the same time on the next foreground.
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
      // If the ad never loads (no network, no inventory) don't wait forever —
      // must not lock up the caller's flow (the foreground handler).
      setTimeout(finish, 10_000);
    });
  } catch (e) {
    console.warn('[Reklam] Gösterilemedi:', e);
  }
}
