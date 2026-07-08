// Sentry hata izleme. Kimlik bilgisi .env'den okunur (EXPO_PUBLIC_ önekli
// değişkenler derlemeye gömülür). DSN yoksa Sentry sessizce devre dışı kalır —
// supabase.ts'teki isSyncConfigured deseniyle aynı desen: eksik yapılandırma
// hiçbir şeyi çökertmez, ilgili özellik yalnızca pasif kalır.
//
// MEVCUT DURUM (bilinçli): Sentry KAPALI. DSN girilmediği için init hiç çağrılmaz
// ve hiçbir hata gönderilmez. Ayrıca app.json'daki Sentry EXPO CONFIG PLUGIN'i
// çıkarılmıştır (commit af0fa17): plugin'in build-zamanı kaynak-harita yükleme
// adımı, SENTRY_AUTH_TOKEN olmadan EAS Android build'ini gradle'da düşürüyordu.
// Native modül autolink'li olduğundan plugin olmadan da (DSN girilirse) runtime
// çökmeleri yakalanır; plugin'in asıl kattığı şey panelde OKUNAKLI (minify çözülmüş)
// stack trace'tir. Pre-launch'ta gerçek kullanıcı olmadığı için açmak ertelendi.
//
// YAYINA YAKIN AÇMAK İÇİN: (1) sentry.io'da proje aç, DSN'i .env'e yaz; (2) EAS'te
// SENTRY_AUTH_TOKEN secret'ını tanımla; (3) app.json plugins'e '@sentry/react-native'
// plugin'ini org/project ile geri ekle; (4) kontrol build al. Detay: bkz. hafıza notu.

import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const isSentryConfigured = Boolean(dsn);

if (isSentryConfigured) {
  Sentry.init({ dsn, tracesSampleRate: 1.0 });
}

export { Sentry };
