// Tam ekran (interstitial) reklamlar — Google AdMob (react-native-google-mobile-ads).
//
// TETİKLEYİCİ (kullanıcı kararı, 2026-08-04): yalnızca uygulama ÖNE GELDİĞİNDE
// (soğuk açılış dahil), en fazla INTERSTITIAL_MIN_GAP_MS'de bir. BİLEREK
// YAPILMAYAN yer: bir alışkanlık/görev TAMAMLANDIĞINDA. Bu uygulamanın çekirdek
// tasarımı "tamamlama = anında olumlu geri bildirim" üzerine kurulu (haptik,
// animasyon, seri/puan sistemi — bkz. habitScore.ts). Tamamlamadan hemen sonra
// tam ekran reklam çıkarmak bu döngüyü doğrudan baltalar ve elde tutmayı
// düşürür — bu yüzden reklam katmanı habitRepo/taskRepo'nun tamamlama yollarına
// HİÇ dokunmaz, yalnızca AppData'nın öne-gelme tetikleyicisine bağlanır.
//
// İLK KURULUMDA HİÇ REKLAM YOK: bkz. adsLogic.shouldShowInterstitial — lastShownAt
// hiç kaydedilmemişse zamanlayıcı "şimdi" ile tohumlanır ama reklam GÖSTERİLMEZ;
// kullanıcı tanıtım/giriş ekranlarının hemen ardından tam ekran reklamla
// karşılaşmasın diye.
//
// TEST ID'LERİ — GERÇEK YAYINDAN ÖNCE DEĞİŞTİRİLMESİ GEREKENLER:
// app.json'daki `androidAppId` VE aşağıdaki varsayılan ad unit id'si Google'ın
// herkese açık TEST kimlikleridir (ca-app-pub-3940256099942544~...). Bunlar
// çökmeden çalışır ama GELİR ÜRETMEZ. Gerçek yayından önce:
//   1) AdMob hesabında uygulama + interstitial reklam birimi oluştur.
//   2) app.json > plugins > "react-native-google-mobile-ads" > androidAppId'yi
//      gerçek App ID ile değiştir (bu bir native manifest alanı — değişiklik
//      ancak yeniden `expo prebuild` ile etkili olur).
//   3) .env'e EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT_ID = gerçek ad unit id'sini yaz.
//
// GDPR/UMP ONAYI: AdsConsent.gatherConsent() SDK başlatılmadan ÖNCE çağrılır —
// Google'ın kendi yönergesi bu sırayı zorunlu kılıyor (AB/İngiltere kullanıcısına
// reklam isteği atılmadan önce onay durumu bilinmeli). Form İÇERİĞİ AdMob
// panelinde ayarlanır (Privacy & messaging); kod tarafı yalnızca akışı tetikler.
//
// EXPO GO / HENÜZ DERLENMEMİŞ BUILD: native modül yoktur. Lazy require + try/catch
// (bu kod tabanındaki customNotificationChannel.ts/ringtonePicker.ts ile aynı
// güvenlik deseni) — bulunamazsa reklam katmanı sessizce pasif kalır.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { shouldShowInterstitial } from './adsLogic';

const LAST_SHOWN_KEY = 'ads:lastInterstitialShownAt';
const INTERSTITIAL_MIN_GAP_MS = 30 * 60 * 1000; // 30 dakika

// Google'ın herkese açık test ad unit id'si — bkz. dosya başı notu.
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
    return null; // Expo Go / native modül henüz derlenmemiş
  }
}

let initPromise: Promise<void> | null = null;

// SDK'yı başlatır ve GDPR/UMP onay akışını SDK başlatmadan ÖNCE tamamlar.
// İdempotent (eşzamanlı çağrılar aynı promise'i paylaşır) — hem bu dosyadan hem
// dışarıdan güvenle birden çok kez çağrılabilir.
function ensureInitialized(native: NativeAdsModule): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await native.AdsConsent.gatherConsent();
      await native.MobileAds().initialize();
    })();
  }
  return initPromise;
}

// Uygulama öne geldiğinde (soğuk açılış dahil) çağrılır — bkz. ui/AppData.tsx.
// Sıklık sınırını kendi başına uygular (AsyncStorage'da kalıcı, süreç yeniden
// başlasa da hatırlanır); çağıranın ayrıca bir kapı kurmasına gerek yoktur.
// HİÇBİR KOŞULDA REDDETMEZ: bu bir yan etkidir, kullanıcının asıl akışını
// (senkron, veri yükleme) bloklamamalı ya da bozmamalı.
export async function maybeShowInterstitial(): Promise<void> {
  const native = loadNative();
  if (!native) return;

  try {
    const now = Date.now();
    const stored = await AsyncStorage.getItem(LAST_SHOWN_KEY);
    const lastShownAt = stored ? Number(stored) : null;

    if (!shouldShowInterstitial(lastShownAt, now, INTERSTITIAL_MIN_GAP_MS)) {
      // İlk kontrol: reklam göstermeden zamanlayıcıyı tohumla (bkz. dosya başı notu).
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
        // "Gösterildi" damgası YÜKLENME anında yazılır (show() öncesi): bir
        // sonraki öne-gelmede aynı anda ikinci bir yükleme denemesi başlamasın.
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
      // Reklam hiç yüklenmezse (ağ yok, envanter yok) sonsuza dek beklemesin —
      // çağıranın akışını (foreground handler) kilitlemez.
      setTimeout(finish, 10_000);
    });
  } catch (e) {
    console.warn('[Reklam] Gösterilemedi:', e);
  }
}
