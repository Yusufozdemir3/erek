// Language → Intl locale. Kept apart from ui/theme.ts (which re-exports it) so
// pure date formatting doesn't pull in react-native.

import type { Lang } from '@/i18n/translations';

export const DATE_LOCALE: Record<Lang, string> = { tr: 'tr-TR', en: 'en-US', de: 'de-DE' };
