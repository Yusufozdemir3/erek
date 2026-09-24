// Language → locale mapping for Intl. SPLIT OFF from src/ui/theme.ts: even
// though this is plain data, living there meant every module that imported
// it also pulled in react-native (StyleSheet) — which kept PURE modules that
// format dates (e.g. ui/habit/habitStatsFormat) from running in the fast
// 'logic' test project.
//
// theme.ts re-exports this for backward compatibility; new code should
// import directly from here.

import type { Lang } from '@/i18n/translations';

export const DATE_LOCALE: Record<Lang, string> = { tr: 'tr-TR', en: 'en-US', de: 'de-DE' };
