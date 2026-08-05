// react-native-google-mobile-ads'in pinlediği play-services-ads (24.6.0) Kotlin
// 2.1 metadata'sıyla derlenmiş; bu projenin Kotlin Gradle eklentisi ise 1.9.25
// (RN 0.76'nın varsayılanı) ve yalnız 2.0.0'a kadar metadata okuyabiliyor.
// Sonuç: `:react-native-google-mobile-ads:compileReleaseKotlin` "Incompatible
// classes were found in dependencies" ile patlıyordu — reklam paketinin JS
// sürümünü değiştirmek işe yaramaz, native SDK sürümü her sürümde aynı pinli.
//
// ÇÖZÜM: play-services-ads'i Kotlin 1.9 ile uyumlu bilinen bir sürüme (23.6.0)
// zorluyoruz — yalnızca BU bağımlılığın sürümünü sabitliyoruz, projenin Kotlin
// sürümüne DOKUNMUYORUZ (o çok daha büyük/riskli bir değişiklik olurdu).
//
// NOT: android/ klasörü git'te izlenmiyor (prebuild üretir). Bu yüzden düzeltme
// elle build.gradle'a değil BURAYA yazıldı — her prebuild'de otomatik uygulanır
// (withForceDarkDisabled ile aynı gerekçe).
//
// İLERİDE: react-native-google-mobile-ads yeni bir sürümde Kotlin 1.9 uyumlu bir
// play-services-ads sürümünü kendi pinlerse (ya da proje Kotlin 2.x'e geçerse)
// bu plugin kaldırılabilir — o zaman zorlanan sürüm gereksiz bir tavan olur.

const { withProjectBuildGradle } = require('@expo/config-plugins');

const FORCE_BLOCK = `
    configurations.all {
        resolutionStrategy {
            force 'com.google.android.gms:play-services-ads:23.6.0'
        }
    }`;

module.exports = function withAdsCompatibleGmsAds(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes("play-services-ads:23.6.0")) return cfg; // idempotent
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /allprojects\s*\{/,
      (match) => `${match}\n${FORCE_BLOCK}`
    );
    return cfg;
  });
};
