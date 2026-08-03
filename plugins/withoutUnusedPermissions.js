// Birleştirilmiş (merged) release manifest'inde kod tabanında HİÇ kullanılmayan
// üç izin çıkıyordu (ultra-detaylı inceleme, P1 #5):
//   - android.permission.SYSTEM_ALERT_WINDOW ("diğer uygulamaların üzerinde
//     göster") — expo-dev-client'ın kendi manifest'inden geliyor, yalnız onun
//     geliştirme menüsü için; release build'de anlamsız VE Play'in özel olarak
//     izlediği hassas bir izin (overlay saldırıları için kullanılabiliyor).
//   - android.permission.READ_EXTERNAL_STORAGE / WRITE_EXTERNAL_STORAGE —
//     expo-file-system'den geliyor; o paket yalnız expo-asset'in ikon
//     fontlarını yükleyebilmesi için var, dosya sistemine kullanıcı verisi
//     yazılmıyor. WRITE_EXTERNAL_STORAGE zaten API 33+'ta işlevsiz, salt gürültü.
//
// Manifest merger, kütüphane manifest'lerinden gelen izinleri tools:node="remove"
// ile ana manifest'ten ÇIKARABİLİR (withPermissions'ın eklemenin tersi). Bu
// üçü burada çıkarılır — "önce cihazında, gizliliğe saygılı" konumlandıran bir
// uygulamanın kurulumda "diğer uygulamaların üzerinde göster" istemesi hem
// mağaza incelemesinde soru işareti hem kullanıcı güvenini kırıcı.
//
// NOT: android/ klasörü git'te izlenmiyor (prebuild üretir). Bu yüzden düzeltme
// elle AndroidManifest.xml'e değil BURAYA yazıldı — her prebuild'de otomatik
// uygulanır (withForceDarkDisabled ile aynı gerekçe).

const { withAndroidManifest } = require('@expo/config-plugins');

const REMOVED_PERMISSIONS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];

module.exports = function withoutUnusedPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';
    manifest['uses-permission'] = manifest['uses-permission'] || [];
    for (const name of REMOVED_PERMISSIONS) {
      manifest['uses-permission'].push({
        $: { 'android:name': name, 'tools:node': 'remove' },
      });
    }
    return cfg;
  });
};
