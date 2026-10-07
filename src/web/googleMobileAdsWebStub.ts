// WEB-ONLY stand-in for react-native-google-mobile-ads (metro.config.js): the
// package breaks Metro's web bundling itself, which no try/catch can catch.
// Consent returns "ok", init does nothing and no ad ever loads — just enough
// for the app to open in a browser.

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
    // No LOADED event ever fires; ads.ts gives up after its timeout.
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
