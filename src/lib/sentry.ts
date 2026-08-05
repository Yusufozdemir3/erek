// Sentry hata izleme. Kimlik bilgisi .env'den okunur (EXPO_PUBLIC_ önekli
// değişkenler derlemeye gömülür). DSN yoksa Sentry sessizce devre dışı kalır —
// supabase.ts'teki isSyncConfigured deseniyle aynı desen: eksik yapılandırma
// hiçbir şeyi çökertmez, ilgili özellik yalnızca pasif kalır.
//
// MEVCUT DURUM (2026-08-04): Sentry AÇIK — .env'de DSN tanımlı, runtime çökmeleri
// panele düşüyor. Uygulama yayında olduğu ve başka hiçbir gözlemlenebilirlik
// aracı bulunmadığı için açıldı (öncesinde bir kullanıcı çökse haberimiz olmuyordu).
//
// ⚠ HÂLÂ EKSİK — STACK TRACE'LER MINIFIED: app.json'daki Sentry EXPO CONFIG
// PLUGIN'i hâlâ ÇIKARIK (commit af0fa17): plugin'in build-zamanı kaynak-harita
// yükleme adımı, SENTRY_AUTH_TOKEN olmadan Android build'ini gradle'da düşürüyor.
// Native modül autolink'li olduğundan plugin olmadan da hatalar YAKALANIR;
// plugin'in kattığı tek şey panelde okunaklı (minify çözülmüş) trace.
// AÇMAK İÇİN — SIRA ÖNEMLİ (token önce, yoksa build patlar):
//   (1) sentry.io > Settings > Auth Tokens: project:releases + org:read yetkili token;
//   (2) token'ı build ortamına ver — EAS'te build alınıyorsa `eas secret:create
//       --name SENTRY_AUTH_TOKEN`, YEREL Gradle build'de EAS secret'ı İŞE YARAMAZ,
//       token gradlew çağrısından önce ortam değişkeni olarak verilmeli (android/
//       klasörüne yazma: prebuild --clean siler);
//   (3) app.json plugins'e şunu ekle (organization SLUG'ı hazır — panelden alındı):
//       ['@sentry/react-native', { organization: 'yusuf-01', project: 'erek' }]
//   (4) kontrol build alıp panelde trace'in okunaklı geldiğini doğrula.

import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const isSentryConfigured = Boolean(dsn);

if (isSentryConfigured) {
  // tracesSampleRate: PERFORMANS izlemesinin örnekleme oranı — çökme yakalamayla
  // ilgisi YOKTUR, o ayrıdır ve bu ayardan bağımsız olarak hep çalışır.
  // 0 = performans izlemesi tamamen kapalı. Üç gerekçe:
  //   - Bu veriyi tüketen kimse yok; istediğimiz tek şey çökme görünürlüğü.
  //   - Ücretsiz kotayı çökmelere bırakır (eskiden 1.0'dı: her şeyi gönderiyordu).
  //   - Gizlilik politikasındaki "kullanım analitiği toplanmaz" sözünü tartışmasız
  //     tutar — işlem/zamanlama verisi o sözün gri alanına giriyordu.
  Sentry.init({
    dsn,
    // GELİŞTİRMEDE TAMAMEN KAPALI. İki gerekçe: (1) geliştirirken ürettiğimiz
    // hatalar gerçek kullanıcı çökmeleriyle aynı panele düşüp sinyali gürültüye
    // boğuyordu; (2) ücretsiz planın aylık hata kotasını yakıyordu. Bunun bedeli:
    // Sentry'nin çalıştığı ancak GERÇEK bir build ile doğrulanabilir — `expo start`
    // ile test hatası fırlatmak artık hiçbir şey göndermez (beklenen davranış).
    enabled: !__DEV__,
    tracesSampleRate: 0,
    // sendDefaultPii: SDK'nın varsayılanı da false ama AÇIKÇA yazılıyor — gizlilik
    // politikasının §5'te verdiği "kimlik bilgisi göndermiyoruz" sözünün kodda
    // karşılığı bu satır. Varsayılana güvenmek, bir SDK yükseltmesinin sözü
    // sessizce bozabileceği anlamına gelirdi.
    sendDefaultPii: false,
  });
}

export { Sentry };
