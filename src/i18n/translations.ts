// Çeviri sözlüğü. Kaynak dil Türkçe'dir (tr) ve aynı zamanda YEDEK dildir:
// bir anahtar seçili dilde yoksa Türkçe karşılığı gösterilir (uygulama asla
// çeviri eksikliğinden boş/kırık metin göstermez). Anahtarlar noktalı ad
// alanlarıyla düzenlenir (ör. 'tabs.today'). {param} yer tutucuları t()'nin
// ikinci argümanıyla doldurulur.

import type { Dict } from '@/i18n/dict';
import { tr } from '@/i18n/tr';
import { en } from '@/i18n/en';
import { de } from '@/i18n/de';

export type Lang = 'tr' | 'en' | 'de';
export const SUPPORTED_LANGS: Lang[] = ['tr', 'en', 'de'];

// Dil seçicide gösterilecek adlar (kendi dilinde).
export const LANG_LABELS: Record<Lang, string> = {
  tr: 'Türkçe',
  en: 'English',
  de: 'Deutsch',
};

export const translations: Record<Lang, Dict> = { tr, en, de };

// Verilen dilde bir anahtarı çevirir; {param} yer tutucularını doldurur.
// useI18n().t() bunu sarmalar; ayrıca React dışı modüllerin (ör. bildirimler)
// mevcut dili elle okuyup çeviri yapması için de doğrudan kullanılabilir.
export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  // Seçili dil → Türkçe yedek → anahtarın kendisi (son çare).
  let s = translations[lang][key] ?? translations.tr[key] ?? key;
  if (params) {
    for (const [k, val] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(val));
    }
  }
  return s;
}
