// List search: every word the user typed must appear somewhere in the title
// (as part of a word, so "alis" finds "Alışveriş yap"), in any order.

import type { Lang } from '@/i18n/translations';
import { fold } from '@/lib/textFold';

export const MAX_QUERY_LEN = 80;

// Pre-folded words of a query; empty = no filter.
export function queryWords(query: string, lang: Lang): string[] {
  return fold(query.slice(0, MAX_QUERY_LEN), lang).split(/\s+/).filter(Boolean);
}

export function matchesWords(title: string, words: string[], lang: Lang): boolean {
  if (words.length === 0) return true;
  const t = fold(title, lang);
  return words.every((w) => t.includes(w));
}
