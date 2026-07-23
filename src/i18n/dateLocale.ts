// Intl için dil → yerel ayar eşlemesi. src/ui/theme.ts'ten AYRILDI: saf veri
// olmasına rağmen orada durduğu için onu import eden her modül react-native'i
// (StyleSheet) de çekiyordu — bu, tarih biçimlendiren SAF modüllerin hızlı
// 'logic' test projesinde koşmasını engelliyordu (ör. ui/habit/habitStatsFormat).
//
// theme.ts geriye uyum için bunu yeniden dışa açar; yeni kod doğrudan buradan
// import etmeli.

import type { Lang } from '@/i18n/translations';

export const DATE_LOCALE: Record<Lang, string> = { tr: 'tr-TR', en: 'en-US', de: 'de-DE' };
