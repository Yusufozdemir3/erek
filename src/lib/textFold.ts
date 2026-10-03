// Comparing user text the way people type it: no case, no diacritics
// ("Alışveriş" ~ "alisveris", "Größe" ~ "grosse"). Turkish dotted/dotless i is
// lower-cased by hand so it doesn't depend on the JS engine's locale data.

import type { Lang } from '@/i18n/translations';
import { lower } from '@/lib/quickAdd/core';

const FOLD: Record<string, string> = { ı: 'i', ğ: 'g', ş: 's', ç: 'c', ö: 'o', ü: 'u', ä: 'a', ß: 'ss', â: 'a', î: 'i', û: 'u' };

export function fold(s: string, lang: Lang): string {
  const l = lower(s, lang).replace(/['’`]/g, '');
  let out = '';
  for (const ch of l) out += FOLD[ch] ?? ch;
  return out.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
