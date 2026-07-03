// Sentry hata izleme. Kimlik bilgisi .env'den okunur (EXPO_PUBLIC_ önekli
// değişkenler derlemeye gömülür). DSN yoksa Sentry sessizce devre dışı kalır —
// supabase.ts'teki isSyncConfigured deseniyle aynı desen: eksik yapılandırma
// hiçbir şeyi çökertmez, ilgili özellik yalnızca pasif kalır.

import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const isSentryConfigured = Boolean(dsn);

if (isSentryConfigured) {
  Sentry.init({ dsn, tracesSampleRate: 1.0 });
}

export { Sentry };
