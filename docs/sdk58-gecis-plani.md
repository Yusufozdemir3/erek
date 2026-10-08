# Expo SDK 53 → 58 (AGP 9) geçiş araştırması

Tarih: 2026-10-08. Amaç: AGP 9'a çıkmak (Play'in "AGP 9 + R8" önerisi). Bu belge
**araştırmadır**; kod değişmedi. Kaynaklar sonda.

## 1. Şu anki durum

| | Bizde | Kararlı en güncel (SDK 57) | Hedef (SDK 58) |
|---|---|---|---|
| Expo SDK | 53 (`~53.0.27`) | 57 (`npm latest`) | 58 (`58.0.6`, `next`) |
| React Native | 0.79.6 | 0.86.3 | 0.88.0-rc.3 |
| React | 19.0.0 | 19.2.3 | 19.3.0 |
| AGP | 8.8.2 | 8.12.0 | **9.2.1** |
| Kotlin (RN'in) | 2.0.21 | — | 2.2.0 |
| Gradle | 8.13 | 9.x (SDK 55+) | 9.x |

AGP 9, React Native 0.87 ve üstünde geliyor (RN 0.87.0 = AGP 9.2.1). Kararlı
Expo'da hiçbir SDK RN 0.87+ taşımıyor; SDK 57 RN 0.86.3 (AGP 8.12). **AGP 9'a
giden tek yol SDK 58.**

## 2. Zamanlama

SDK 58 şu an **beta**: 15 Eylül 2026'da duyuruldu, beta 3–4 hafta sürecek;
kararlı sürüm RN 0.88 çıkınca, hemen ardından gelecek. `npm`'de `latest` hâlâ
SDK 57. Tam değişiklik notu da kararlıyla birlikte yayınlanacak (SDK 58
changelog sayfası şu an 404). → **SDK 58 kararlı olunca (tahminen Ekim sonu –
Kasım) 53'ten doğrudan 58'e geçmek mantıklı.** Ara sürümleri (54–57) tek tek
uygulamaya gerek yok; ama her birinin kırıcı değişiklikleri birikir (bölüm 4).

## 3. Paket karşılaştırması (SDK 58'in `bundledNativeModules.json`'ı)

Expo paketleri `~58.x`'e gider. Önemli sıçramalar:

| Paket | Bizde | SDK 58 / en güncel |
|---|---|---|
| expo-router | ~5.1.11 | ~58.0.16 |
| react-native-reanimated | ~3.17.4 | 4.7.0 (+ `react-native-worklets`) |
| react-native-screens | ~4.11.1 | ~4.28.0 |
| react-native-safe-area-context | 5.4.0 | ~5.9.1 |
| react-native-web | ^0.20.0 | ~0.21.3 |
| expo-notifications | ~0.31.5 | ~58.1.1 |
| expo-sqlite | ~15.2.14 | ~58.0.10 |
| @react-native-async-storage/async-storage | 2.1.2 | 2.2.0 |
| @sentry/react-native | ~6.14.0 | ~8.28.0 (iki major) |
| jest-expo | ~53.0.14 | ~58.0.8 |

Expo dışı (SDK'dan bağımsız, ayrıca uyumlandırılacak):

| Paket | Bizde | Güncel | Not |
|---|---|---|---|
| react-native-android-widget | 0.17.2 (**yamalı**) | 0.22.1 | `expo>=54` ister; yama yeniden üretilecek (bölüm 5) |
| expo-speech-recognition | 2.1.5 | 57.1.0 | Sürüm numarası 56'dan beri Expo SDK'yı izliyor; 58 için `^58` çıkmış mı bakılacak |
| react-native-purchases | 9.2.0 | 10.11.0 | Major; minSdk 23 (bizde 24 → sorun yok), Billing 8.3 |
| react-native-google-mobile-ads | ^15.8.3 | 17.2.0 | 17: RN 0.76+, **yeni mimari zorunlu**, API yenilendi |
| @react-native-google-signin/google-signin | ^16.1.2 | 16.1.5 | küçük |
| react-native-get-random-values | ~1.11.0 | 2.0.0 | RN ≥0.81 ister |
| react-native-url-polyfill | ^3.0.0 | 4.0.0 | |
| @testing-library/react-native | ^13.3.3 | 14.0.1 | `test-renderer` peer'i yeni |

## 4. Kırıcı değişiklikler ve bizim koda etkisi

(Expo changelog'ları SDK 54, 55, 56, 57; 58 için yalnız beta duyurusu.)

**Her SDK'dan toplanan, bizi etkileyenler:**

1. **`expo-file-system` (SDK 54):** varsayılan dışa aktarma yeni API oldu.
   `readAsStringAsync / writeAsStringAsync / deleteAsync / cacheDirectory`
   artık `expo-file-system/legacy`'den. `legacy` yolu SDK 58'de hâlâ var
   (doğrulandı). Bizde **2 dosya, 5 çağrı**: `src/lib/pickExport.ts`,
   `src/lib/shareExport.ts`. En küçük çözüm: import'u `/legacy`'ye çevirmek.
2. **Yeni mimari zorunlu (SDK 55):** `app.json`'daki `newArchEnabled`
   kaldırılacak (zaten açığız).
3. **Kenardan kenara zorunlu (SDK 54/55):** bizde zaten güvenli alan düzeltmesi
   yapıldı (commit 5522670). `androidStatusBar`/`androidNavigationBar` anahtarları
   ve `expo-status-bar`'ın `backgroundColor`/`translucent` prop'ları artık
   etkisiz; kullanıyorsak kaldırılacak.
4. **`expo-build-properties` (SDK 54):** `enableProguardInReleaseBuilds` →
   **`enableMinifyInReleaseBuilds`** (az önce eklediğimiz R8 ayarı yeniden
   adlandırılacak).
5. **`expo-router` (SDK 56):** `react-navigation`'a bağımlılığı kalktı;
   `@react-navigation/*` import'ları çalışmaz. Bizde **2 yer**:
   `app/_layout.tsx` (`@react-navigation/native`: tema), `src/ui/tabTransition.ts`
   (`@react-navigation/bottom-tabs` tipi). Resmî codemod:
   `npx expo-codemod sdk-56-expo-router-react-navigation-replace`.
6. **Hermes V1 varsayılan (SDK 56):** reanimated/worklets ile bellek gerilemesi
   SDK 57'de (`expo@57.0.9`) düzeltildi → SDK 58 etkilenmez.
7. **Reanimated 3 → 4:** yalnız yeni mimari + `react-native-worklets`. Bizde az
   kullanım: `useSharedValue/useAnimatedStyle/withTiming` (3'er), `LinearTransition`
   (12 yerde, v4'te de var). `babel-preset-expo` eklentiyi kendisi ekliyor
   (`babel.config.js`'e dokunmak gerekmez).
8. **`expo prebuild` varsayılanı temiz (SDK 57):** `android/` her seferinde
   yeniden üretilir → bizim **elle imza bloğu + versionCode** düzenlemeleri
   (bkz. `erek-yerel-build`) kaybolur. Çözüm: bunu bir **config plugin** yapmak
   (`plugins/withReleaseSigning.js`), elle adım kalmasın.
9. **`expo-notifications`:** 54'te "deprecated fonksiyon dışa aktarmaları"
   kaldırıldı; 55'te `app.json` `notification` alanı kaldırıldı (bizde yok).
   Kullandığımız çekirdek API (`schedule/cancel/getAll…`, channel yönetimi,
   `SchedulableTriggerInputTypes`, izin API'si, handler) 58.1.1'de duruyor
   (tip dosyalarından doğrulandı). `AndroidImportance` /
   `AndroidNotificationVisibility` enum'ları ayrıca tsc ile doğrulanacak.
10. **Node:** `^22.13 / ^24.3 / ^25` yeterli (makinede 25.6.1).

**Expo dışı paketler:**

11. **react-native-google-mobile-ads 15 → 17:** yeni mimari + RN 0.76+ (sağlanıyor);
    API "yenilendi". Bizim kullanım küçük (`src/lib/ads.ts`: `MobileAds().initialize`,
    `InterstitialAd.createForAdRequest`, `AdEventType`, `AdsConsent.gatherConsent`)
    ve v17'de eski API'nin korunup korunmadığı changelog'dan tam çıkmıyor →
    **göçte en çok test isteyen yer**. İlk deneme: 16.x'e çıkmak (17'nin
    kırıcıları olmadan).
12. **react-native-purchases 9 → 10:** minSdk 23 (bizde 24, sorun yok);
    Billing 8.3; **tek seferlik ürünleri "consumable" yapılandırdıysak ve oturum
    sistemi yoksa 10.0'dan itibaren restore edilemez** → RevenueCat panelinde
    "Plus/reklamsız" ürünlerinin *non-consumable* olduğu doğrulanmalı.
13. **expo-speech-recognition:** 3.0'da üst düzey dışa aktarmalar kalktı —
    `src/lib/voice.ts` zaten `ExpoSpeechRecognitionModule` üzerinden çağırıyor;
    56.0.1'de `download_canceled` → `download_scheduled` yeniden adlandırması
    var (bizde bu değeri kontrol eden satır yok); 56.0.4'te "minify'li release
    build'de tanıma" düzeltmesi var (R8 açtığımıza göre yararlı).
14. **@sentry/react-native 6 → 8:** iki major; kullanımımız küçük
    (`src/lib/sentry.ts`, `CrashScreen`, `_layout` `Sentry.wrap`). v7 ve v8
    geçiş rehberleri okunacak.
15. **react-native-android-widget 0.17 → 0.22 + yama:** bölüm 5.

## 5. Widget yaması (MIUI/HyperOS)

`patches/react-native-android-widget+0.17.2.patch`, `RNWidget.java`'da MIUI'de
raporlanan genişliği görünür çerçeveye indiren bir `visibleDp()` ekliyor.
0.22.1'de aynı üç satır (`getWidgetWidth/Height` ile `offsetViewBounds` hesabı,
satır ~177 ve ~255–256) **hâlâ yamasız** duruyor → yama gerekli, ama satır
numaraları kaymış; `patch-package` ofsetle uygulayabilir ya da elle yeniden
üretilmeli. Önce 0.22.1 `expo>=54` istediği için SDK ile birlikte yükseltilir.

## 6. Önerilen yol (SDK 58 kararlı olunca)

1. Yeni dalda `npx expo install expo@^58 --fix`, sonra `npx expo-doctor`.
2. Kod değişiklikleri: file-system `/legacy` import'ları, router codemod'u,
   `newArchEnabled`/`enableProguard…` anahtarları, reanimated v4.
3. Üçüncü taraflar: android-widget 0.22 + yeni yama, purchases 10, mobile-ads
   (önce 16, olursa 17), speech-recognition `^58`, sentry 8, testing-library 14.
4. Config plugin: release imza + versionCode (prebuild'in `android/`ı
   silmesine karşı).
5. `tsc` + testler (1405) + `expo prebuild --clean` + AGP 9.2.1 ile release build.
6. Cihazda tam tur (kontrol listesi bölüm 7), sonra AAB.

## 7. Cihaz test listesi (göç sonrası)

Açılış/gezinme; **zamanlayıcı bildirimi** (kilit ekranı, düğmeler, kuyruk);
widget'lar (MIUI'de dokunma alanları — yama); sesli görev; bildirimler;
Google giriş + eşitleme; **reklam (açılış/kapanış) + Plus satın alma/restore**;
dışa/içe aktarma (file-system); sekme geçişleri ve animasyonlar (reanimated 4);
kenardan kenara düzen.

## 8. Riskler

- SDK 58 beta + RN 0.88 RC: kararlıyı beklemek bu yüzden şart.
- Reanimated 4, Sentry 8, mobile-ads 17, purchases 10: her biri major.
- Widget yaması ve üç yerel Kotlin modülümüz (`timer-notification`,
  `custom-notification-channel`) Kotlin 2.2 / AGP 9 ile derlenmeli.
- `android/` artık her prebuild'de sıfırlanıyor → imza otomasyonu şart.

## Kaynaklar

- Expo SDK 54–57 changelog: https://expo.dev/changelog/sdk-54 (…/sdk-55, /sdk-56, /sdk-57)
- Expo SDK 58 beta: https://expo.dev/changelog/sdk-58-beta
- RN 0.87 yayın yazısı (AGP 9 desteği): https://reactnative.dev/blog/2026/08/11/react-native-0.87
- RN `gradle/libs.versions.toml` (0.79: agp 8.8.2; 0.86.3: 8.12.0; 0.87.0 / 0.88.0-rc.3: 9.2.1)
- `npm view expo@58.0.6` ve `bundledNativeModules.json`
- react-native-purchases, react-native-google-mobile-ads, expo-speech-recognition
  GitHub changelog / release notları
