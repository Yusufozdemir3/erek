// Android'in "zorla koyu" (force dark) özelliğini KAPATIR.
//
// NEDEN: Uygulama kendi temasını kendi yönetiyor (Profil > Görünüm: Açık/Koyu/
// Sistem + koyu stili + vurgu rengi; bkz. src/ui/ThemeProvider.tsx). Ama native
// Android teması Theme.AppCompat.Light.NoActionBar ve API 29+'ta böyle "açık"
// temalı uygulamalarda android:forceDarkAllowed VARSAYILAN olarak true. Telefon
// koyu moddayken OS uygulamanın açık zeminlerini ZORLA karartıyor — kullanıcı
// Profil'den "Açık"ı seçse bile ekran koyu kalıyordu (vurgu renkleri açık
// paletine geçtiği için "yarı açık/yarı koyu" tuhaf bir hâl oluşuyordu).
// MIUI/Xiaomi bunu özellikle agresif uyguluyor; stock/emülatörde varsayılan
// kapalı olduğu için gözden kaçmıştı (emülatörde `setprop debug.hwui.force_dark
// true` ile birebir üretildi).
//
// Bu plugin AppTheme'e android:forceDarkAllowed=false ekler → OS asla karartmaz,
// açık/koyu tamamen ThemeProvider'ın kontrolünde kalır.
//
// NOT: android/ klasörü git'te izlenmiyor (prebuild üretir). Bu yüzden düzeltme
// elle styles.xml'e değil BURAYA yazıldı — her prebuild'de otomatik uygulanır.

const { withAndroidStyles, AndroidConfig } = require('@expo/config-plugins');

module.exports = function withForceDarkDisabled(config) {
  return withAndroidStyles(config, (cfg) => {
    cfg.modResults = AndroidConfig.Styles.assignStylesValue(cfg.modResults, {
      add: true,
      name: 'android:forceDarkAllowed',
      value: 'false',
      parent: AndroidConfig.Styles.getAppThemeLightNoActionBarGroup(),
    });
    return cfg;
  });
};
