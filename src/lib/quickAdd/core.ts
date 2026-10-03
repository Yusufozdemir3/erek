// Shared building blocks of the quick-add parser (see parseTask.ts): tokens,
// the match/effect model the language rules speak, and small helpers they all
// use. Rules look at ONE token (plus a little lookahead) at a time — no regex
// ever runs over the whole sentence, so a pathological input can't stall the
// UI thread.

import type { Lang } from '@/i18n/translations';
import type { Priority } from '@/types/models';

export interface Token {
  text: string; // the piece as written, punctuation included (rebuilds the title)
  raw: string; // edge punctuation removed
  w: string; // lower-cased, apostrophes unified — what rules compare against
  base: string; // TR: the part before an apostrophe ("3'te" -> "3"); else === w
  sfx: string; // TR: the part after it ("te"); else ''
  dot: boolean; // the piece ended with "." (German ordinals: "am 15.")
}

export type Period = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';

export type DateSpec =
  | { kind: 'offset'; days: number } // today + n
  // nextWeek: that weekday in the NEXT calendar week ("haftaya salı");
  // otherwise the nearest one, today included ("cuma", "this friday").
  | { kind: 'weekday'; wd: number; nextWeek: boolean }
  | { kind: 'monthDay'; day: number; month?: number }; // month 1-12; none = this/next month

// h is 0-23. exact = unambiguous 24h value ("15:30", "09:00", "on beşte");
// otherwise h is 1-12 and AM/PM is decided later from ampm/period/now.
export interface ClockSpec {
  h: number;
  m: number;
  exact?: boolean;
  ampm?: 'am' | 'pm';
}

export interface Effects {
  date?: DateSpec;
  period?: Period;
  clock?: ClockSpec;
  relMinutes?: number; // "2 saat sonra": date AND time, counted from now
  priority?: Priority;
  remind?: boolean;
}

export interface Match {
  len: number; // tokens covered
  fx: Effects;
  // Not sure the words belong to the date: the field is filled (unless a
  // confident match fills it) but the words STAY in the title.
  weak?: boolean;
  filler?: boolean; // "lütfen", "add a task" — removed, no effect
}

export interface MatchCtx {
  prev: Match | null; // the match that ended right before this token, if any
  atStart: boolean; // nothing but fillers/date words before this token
}

export interface TitleCtx {
  remind: boolean; // a reminder phrase was recognised ("... hatırlat")
  filler: boolean; // a leading filler phrase was recognised
}

export interface LangRules {
  match(toks: Token[], i: number, ctx: MatchCtx): Match | null;
  // Clean-up of the leftover words: dangling connectors, grammar of reminder
  // phrases ("aramayı hatırlat" -> "ara").
  finishTitle(words: Token[], ctx: TitleCtx): Token[];
}

export const CLOCK_RE = /^(\d{1,2})[:.](\d{2})$/;

// Deterministic Turkish casing (dotted/dotless i) without relying on the JS
// engine's locale data.
export function lower(s: string, lang: Lang): string {
  return lang === 'tr' ? s.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase() : s.toLowerCase();
}

export function capitalize(s: string, lang: Lang): string {
  if (!s) return s;
  const c = s[0];
  const up = lang === 'tr' && c === 'i' ? 'İ' : lang === 'tr' && c === 'ı' ? 'I' : c.toUpperCase();
  return up + s.slice(1);
}

const APOSTROPHES = /[’‘ʼ`´′]/g;
const EDGE_PUNCT = /^["“”„«»()[\]{}.,;:!?…]+|["“”„«»()[\]{}.,;:!?…]+$/g;

export function tokenize(text: string, lang: Lang): Token[] {
  const out: Token[] = [];
  for (const text_ of text.replace(APOSTROPHES, "'").split(/\s+/)) {
    const raw = text_.replace(EDGE_PUNCT, '');
    if (!raw) continue;
    const w = lower(raw, lang);
    let base = w;
    let sfx = '';
    // Turkish writes case endings after an apostrophe on numbers and proper
    // nouns ("3'te", "Ekim'de"). English/German apostrophes are part of the
    // word ("don't", "o'clock").
    const k = lang === 'tr' ? w.indexOf("'") : -1;
    if (k > 0) {
      base = w.slice(0, k);
      sfx = w.slice(k + 1);
    }
    out.push({ text: text_, raw, w, base, sfx, dot: text_.endsWith('.') });
  }
  return out;
}

export function wAt(toks: Token[], i: number): string {
  return toks[i]?.w ?? '';
}

export function seq(toks: Token[], i: number, words: readonly string[]): boolean {
  return words.every((w, k) => wAt(toks, i + k) === w);
}

// Length of the LONGEST phrase that matches at i (0 = none).
export function seqLen(toks: Token[], i: number, phrases: readonly (readonly string[])[]): number {
  let best = 0;
  for (const p of phrases) if (p.length > best && seq(toks, i, p)) best = p.length;
  return best;
}

// "yarın akşam", "friday evening": a period word right after a confident date.
export function hasDateBefore(ctx: MatchCtx): boolean {
  return !!ctx.prev && !ctx.prev.weak && !!ctx.prev.fx.date;
}

export function offset(days: number): DateSpec {
  return { kind: 'offset', days };
}

export function clockOf(h: number, m: number): ClockSpec {
  return { h: h % 24, m, exact: h >= 13 || h === 0 || h === 24 };
}

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function plausibleDay(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= MONTH_DAYS[month - 1];
}

export function trimWords(words: Token[], lead: ReadonlySet<string>, trail: ReadonlySet<string>): Token[] {
  let a = 0;
  let b = words.length;
  while (a < b && lead.has(words[a].w)) a++;
  while (b > a && trail.has(words[b - 1].w)) b--;
  return words.slice(a, b);
}

// Replaces a token's spelling (used by the reminder-grammar fixes).
export function respell(t: Token, raw: string): Token {
  return { ...t, raw, text: raw };
}
