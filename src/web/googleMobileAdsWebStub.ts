// WEB-YALNIZ dublör — react-native-google-mobile-ads'in yerine geçer (bkz.
// metro.config.js). Pakette gerçek web desteği yok: iç modül grafiği (lib/module/
// index.js) "./ads/GAMBannerAd" gibi bir dosyayı web derlemesinde bulamıyor ve
// Metro'yu daha bundling AŞAMASINDA durduruyor — bu bir çalışma-zamanı hatası
// değil, yakalanamaz (src/lib/ads.ts'teki try/catch'e hiç ulaşmaz). Metro yalnızca
// platform==='web' iken buraya yönlendiriyor; Android build'i bu dosyaya hiç
// dokunmaz, gerçek native modülü kullanmaya devam eder.
//
// BU GERÇEK BİR REKLAM SDK'SI DEĞİL: onay akışı anında "tamam" döner, SDK
// başlatma no-op'tur, reklam hiç yüklenmez (ads.ts'teki 10sn zaman aşımıyla
// sessizce vazgeçilir). Amaç yalnızca web'de UYGULAMANIN AÇILABİLMESİ — reklam
// akışını web'de görmek/test etmek için DEĞİL (zaten native bir SDK, web'de
// gerçek karşılığı yok).

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
    // Gerçek SDK'da load() bir AdEventType.LOADED olayı tetikler. Burada hiçbir
    // olay hiç ateşlenmez — ads.ts'teki maybeShowInterstitial 10sn sonra sessizce
    // zaman aşımına düşer (kasıtlı, tasarlanmış davranış, çökme değil).
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
