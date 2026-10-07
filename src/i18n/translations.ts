// Translations. Turkish is the source and the fallback: a key missing in the
// selected language shows its Turkish text, never a blank. Keys use dotted
// namespaces ('tabs.today'); {param} placeholders come from t()'s second argument.

import type { Dict } from '@/i18n/dict';
import { tr } from '@/i18n/tr';
import { en } from '@/i18n/en';
import { de } from '@/i18n/de';

export type Lang = 'tr' | 'en' | 'de';
export const SUPPORTED_LANGS: Lang[] = ['tr', 'en', 'de'];

// Names shown in the language picker (in their own language).
export const LANG_LABELS: Record<Lang, string> = {
  tr: 'Türkçe',
  en: 'English',
  de: 'Deutsch',
};

export const translations: Record<Lang, Dict> = { tr, en, de };

// useI18n().t() wraps this; non-React modules (notifications) call it directly.
//
// Plurals: with n === 1, `<key>_one` is tried first; the key itself is the
// plural form, so only keys whose singular differs need a sibling ("1 days
// left" in English, while Turkish never changes). Enough for one/other
// languages — not a CLDR engine.
export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const oneKey = params?.n === 1 ? `${key}_one` : null;
  // Selected language → Turkish → the key itself; a missing singular falls back to the plural.
  let s =
    (oneKey ? translations[lang][oneKey] ?? translations.tr[oneKey] : undefined) ??
    translations[lang][key] ??
    translations.tr[key] ??
    key;
  if (params) {
    for (const [k, val] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(val));
    }
  }
  return s;
}
