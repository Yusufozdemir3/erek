// WEB-ONLY stand-in — replaces react-native-google-mobile-ads (see
// metro.config.js). The package has no real web support: its internal module
// graph (lib/module/index.js) can't find a file like "./ads/GAMBannerAd" in
// the web build, and it stops Metro right at the bundling STAGE — this is not
// a runtime error, and it can't be caught (it never reaches the try/catch in
// src/lib/ads.ts). Metro only routes here when platform==='web'; the Android
// build never touches this file and keeps using the real native module.
//
// THIS IS NOT A REAL AD SDK: the consent flow instantly returns "ok", SDK
// initialization is a no-op, and no ad ever loads (it's silently given up on
// via the 10s timeout in ads.ts). The only goal is for the APP TO BE ABLE TO
// OPEN on web — NOT to see/test the ad flow on web (it's a native SDK anyway, with no real web counterpart).

export const AdEventType = {
  LOADED: 'loaded',
  ERROR: 'error',
  OPENED: 'opened',
  PAID: 'paid',
  CLICKED: 'clicked',
  CLOSED: 'closed',
} as const;

export const TestIds = {
  APP_OPEN: '',
  ADAPTIVE_BANNER: '',
  BANNER: '',
  INTERSTITIAL: '',
  REWARDED: '',
  REWARDED_INTERSTITIAL: '',
  NATIVE: '',
  NATIVE_VIDEO: '',
  GAM_APP_OPEN: '',
  GAM_BANNER: '',
  GAM_INTERSTITIAL: '',
  GAM_REWARDED: '',
  GAM_REWARDED_INTERSTITIAL: '',
  GAM_NATIVE: '',
  GAM_NATIVE_VIDEO: '',
};

export const AdsConsent = {
  gatherConsent: async () => ({}),
  requestInfoUpdate: async () => ({}),
  showForm: async () => ({}),
  loadAndShowConsentFormIfRequired: async () => ({}),
  getConsentInfo: async () => ({}),
  reset: () => {},
};

function noopInterstitial() {
  return {
    // In the real SDK, load() triggers an AdEventType.LOADED event. Here, no
    // event ever fires — ads.ts's maybeShowInterstitial silently times out
    // after 10s (deliberate, designed behavior, not a crash).
    load() {},
    show: async () => {},
    addAdEventListener() {
      return () => {};
    },
  };
}

export const InterstitialAd = {
  createForAdRequest: noopInterstitial,
};

export function MobileAds() {
  return {
    initialize: async () => [],
  };
}

export default MobileAds;
