// Translation dictionary. The source language is Turkish (tr), which also
// serves as the FALLBACK language: if a key is missing in the selected
// language, its Turkish counterpart is shown (the app never shows
// empty/broken text due to a missing translation). Keys are organized with
// dotted namespaces (e.g. 'tabs.today'). {param} placeholders are filled in
// via t()'s second argument.

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

// Translates a key in the given language; fills in {param} placeholders.
// useI18n().t() wraps this; it can also be used directly by non-React
// modules (e.g. notifications) that need to read the current language and
// translate manually.
//
// PLURALS (singular form): if the `n` parameter is 1, `<key>_one` is tried
// first. The key ITSELF is the plural ("other") form — this way the
// hundreds of keys that don't need a plural form stay unchanged and every
// existing call site keeps working as-is; only keys whose singular form
// differs get an `_one` sibling.
// Why this was needed: Turkish doesn't take a plural suffix after a number
// ("1 gün kaldı" / "3 gün kaldı" — both "day(s) left"), so a single template
// looked correct in Turkish — but it produced English "1 days left" and
// German "Noch 1 Tage" / "Vor 1 Tagen".
// NOTE: this is NOT a full CLDR plural engine (it wouldn't be enough for
// languages with few/many categories like Polish or Russian). Since all
// three supported languages only need a one/other distinction, this
// simpler approach was a deliberate choice.
export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const oneKey = params?.n === 1 ? `${key}_one` : null;
  // Selected language → Turkish fallback → the key itself (last resort).
  // If a singular form is being looked up, it follows the same chain and
  // falls back to the plural form if not found.
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
