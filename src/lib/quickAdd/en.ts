// English rules for the quick-add parser (see parseTask.ts).
// A bare number is never a time ("buy 3 apples"); it needs "at", am/pm,
// "o'clock" or a colon. "May" is a month only next to a day number.

import type { Priority } from '@/types/models';
import {
  clockOf,
  hasDateBefore,
  offset,
  plausibleDay,
  seq,
  seqLen,
  trimWords,
  wAt,
  type ClockSpec,
  type DateSpec,
  type LangRules,
  type Match,
  type MatchCtx,
  type Period,
  type Token,
} from './core';

const NUM: Record<string, number | undefined> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

function count(w: string): number | null {
  if (/^\d{1,3}$/.test(w)) return Number(w);
  if (w === 'a' || w === 'an') return 1;
  return NUM[w] ?? null;
}

function hour(w: string): number | null {
  if (/^\d{1,2}$/.test(w)) {
    const h = Number(w);
    return h <= 24 ? h : null;
  }
  return NUM[w] ?? null;
}

function ampmOf(w: string): 'am' | 'pm' | null {
  const x = w.replace(/\./g, '');
  return x === 'am' || x === 'pm' ? x : null;
}

const AT = new Set(['at', 'around', 'by', 'until', 'till']);

function enTime(toks: Token[], i: number): { clock: ClockSpec; len: number } | null {
  const pre = AT.has(wAt(toks, i));
  const j = pre ? i + 1 : i;
  const w = wAt(toks, j);
  if (!w) return null;
  // Optional am/pm right after the clock.
  const tail = (k: number, h: number, m: number, leadingZero = false) => {
    const ap = ampmOf(wAt(toks, k));
    if (ap && h >= 1 && h <= 12) return { clock: { h, m, ampm: ap }, len: k + 1 - i };
    const clock = clockOf(h, m);
    if (leadingZero) clock.exact = true;
    return { clock, len: k - i };
  };

  if (w === 'noon' || w === 'midday') return { clock: { h: 12, m: 0, exact: true }, len: j + 1 - i };
  if (w === 'midnight') return { clock: { h: 0, m: 0, exact: true }, len: j + 1 - i };

  // "half past four", "quarter past four", "quarter to five"
  const dir = wAt(toks, j + 1);
  if ((w === 'half' && dir === 'past') || (w === 'quarter' && (dir === 'past' || dir === 'to'))) {
    const h = hour(wAt(toks, j + 2));
    if (h === null || h < 1 || h > 12) return null;
    if (dir === 'to') return tail(j + 3, h === 1 ? 12 : h - 1, 45);
    return tail(j + 3, h, w === 'half' ? 30 : 15);
  }

  // "3pm", "3:30pm"
  const glued = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(w.replace(/\./g, ''));
  if (glued) {
    const h = Number(glued[1]);
    const m = Number(glued[2] ?? 0);
    if (h < 1 || h > 12 || m > 59) return null;
    return { clock: { h, m, ampm: glued[3] as 'am' | 'pm' }, len: j + 1 - i };
  }

  // "3:30" [pm]
  const colon = /^(\d{1,2}):(\d{2})$/.exec(w);
  if (colon) {
    const h = Number(colon[1]);
    const m = Number(colon[2]);
    if (h > 24 || m > 59) return null;
    return tail(j + 1, h, m, colon[1].startsWith('0'));
  }

  // "at 3", "3 pm", "three o'clock"
  const h = hour(w);
  if (h === null) return null;
  const next = wAt(toks, j + 1);
  const oclock = next === "o'clock";
  if (!pre && !ampmOf(next) && !oclock) return null;
  if (oclock) return { clock: clockOf(h, 0), len: j + 2 - i };
  return tail(j + 1, h, 0);
}

const PERIOD: Record<string, Period | undefined> = {
  morning: 'morning', afternoon: 'afternoon', evening: 'evening', night: 'night',
};

function enPeriod(toks: Token[], i: number, ctx: MatchCtx): Match | null {
  const w = wAt(toks, i);
  if (w === 'tonight') return { len: 1, fx: { date: offset(0), period: 'night' } };
  if (w === 'in' && wAt(toks, i + 1) === 'the') {
    const p = PERIOD[wAt(toks, i + 2)];
    return p && p !== 'night' ? { len: 3, fx: { period: p } } : null;
  }
  if (w === 'at' && wAt(toks, i + 1) === 'night') return { len: 2, fx: { period: 'night' } };
  if (w === 'this') {
    const p = PERIOD[wAt(toks, i + 1)];
    return p && p !== 'night' ? { len: 2, fx: { date: offset(0), period: p } } : null;
  }
  // "tomorrow morning", "friday evening"; a bare "morning run" stays a name
  const p = PERIOD[w];
  return p && hasDateBefore(ctx) ? { len: 1, fx: { period: p } } : null;
}

function enSimpleDate(toks: Token[], i: number): Match | null {
  const w = wAt(toks, i);
  if (w === 'today') return { len: 1, fx: { date: offset(0) } };
  if (w === 'tomorrow') return { len: 1, fx: { date: offset(1) } };
  const dat = seqLen(toks, i, [['the', 'day', 'after', 'tomorrow'], ['day', 'after', 'tomorrow']]);
  if (dat) return { len: dat, fx: { date: offset(2) } };
  if (seq(toks, i, ['next', 'week'])) return { len: 2, fx: { date: offset(7) } };
  if (w === 'in') {
    const n = count(wAt(toks, i + 1));
    const u = wAt(toks, i + 2);
    if (n !== null && (u === 'day' || u === 'days')) return { len: 3, fx: { date: offset(n) } };
    if (n !== null && (u === 'week' || u === 'weeks')) return { len: 3, fx: { date: offset(7 * n) } };
  }
  return null;
}

const WEEKDAY: Record<string, number | undefined> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};
const QUALIFIER = new Set(['on', 'this', 'coming', 'by', 'until', 'till', 'next']);

function enWeekday(toks: Token[], i: number): Match | null {
  const q = wAt(toks, i);
  let j = QUALIFIER.has(q) ? i + 1 : i;
  if (q === 'this' && wAt(toks, j) === 'coming') j++;
  const wd = WEEKDAY[wAt(toks, j)];
  if (wd === undefined) return null;
  const date: DateSpec = { kind: 'weekday', wd, nextWeek: q === 'next' };
  const m: Match = { len: j - i + 1, fx: { date } };
  if (j > i) return m;
  if (enTime(toks, j + 1) || PERIOD[wAt(toks, j + 1)] || seq(toks, j + 1, ['in', 'the'])) return m;
  if (j === toks.length - 1) return m;
  return { ...m, weak: true }; // "Sunday school": Sunday, but keep the word
}

const MONTH: Record<string, number | undefined> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};

function dayOf(w: string): number | null {
  const m = /^(\d{1,2})(st|nd|rd|th)?$/.exec(w);
  if (!m) return null;
  const d = Number(m[1]);
  return d >= 1 && d <= 31 ? d : null;
}

// "october 15", "the 15th of october", "15 oct", "on the 15th"
function enMonthDay(toks: Token[], i: number): Match | null {
  let k = i;
  if (['on', 'by', 'until'].includes(wAt(toks, k))) k++;
  const the = wAt(toks, k) === 'the';
  if (the) k++;
  const day = dayOf(wAt(toks, k));
  if (day !== null) {
    const k2 = wAt(toks, k + 1) === 'of' ? k + 2 : k + 1;
    const month = MONTH[wAt(toks, k2)];
    if (month !== undefined && plausibleDay(month, day)) {
      return { len: k2 - i + 1, fx: { date: { kind: 'monthDay', day, month } } };
    }
    if (the && /\d(st|nd|rd|th)$/.test(wAt(toks, k))) {
      return { len: k - i + 1, fx: { date: { kind: 'monthDay', day } } };
    }
    return null;
  }
  const month = MONTH[wAt(toks, k)];
  if (month === undefined || the) return null;
  const d = dayOf(wAt(toks, k + 1));
  if (d === null || !plausibleDay(month, d)) return null;
  return { len: k + 2 - i, fx: { date: { kind: 'monthDay', day: d, month } } };
}

// "in 2 hours", "in 30 minutes", "in half an hour"
function enRelative(toks: Token[], i: number): Match | null {
  if (wAt(toks, i) !== 'in') return null;
  if (seq(toks, i + 1, ['half', 'an', 'hour'])) return { len: 4, fx: { relMinutes: 30 } };
  const n = count(wAt(toks, i + 1));
  const u = wAt(toks, i + 2);
  if (n === null || n === 0) return null;
  if (u === 'hour' || u === 'hours') return { len: 3, fx: { relMinutes: n * 60 } };
  if (u === 'minute' || u === 'minutes' || u === 'min' || u === 'mins') return { len: 3, fx: { relMinutes: n } };
  return null;
}

const LEVEL: Record<string, Priority | undefined> = { high: 'high', low: 'low', medium: 'medium', normal: 'medium' };
const MARK = new Set(['urgent', 'important']);

function enPriority(toks: Token[], i: number, ctx: MatchCtx): Match | null {
  const w = wAt(toks, i);
  const j = w === 'with' ? i + 1 : i;
  const lvl = LEVEL[wAt(toks, j)];
  if (lvl && wAt(toks, j + 1) === 'priority') return { len: j - i + 2, fx: { priority: lvl } };
  if (j > i) return null;
  if (w === 'priority') {
    const l2 = LEVEL[wAt(toks, i + 1)];
    return l2 ? { len: 2, fx: { priority: l2 } } : null;
  }
  if (w === 'asap' || w === 'urgently') return { len: 1, fx: { priority: 'high' } };
  const len = w === 'very' && MARK.has(wAt(toks, i + 1)) ? 2 : MARK.has(w) ? 1 : 0;
  if (!len) return null;
  if (i + len === toks.length) return { len, fx: { priority: 'high' } };
  return ctx.atStart ? { len, fx: { priority: 'high' }, weak: true } : null;
}

const REMIND = [
  ['remind', 'me', 'to'], ['remind', 'me', 'about'], ['remind', 'me', 'of'], ['remind', 'me'],
  ['set', 'a', 'reminder', 'to'], ['set', 'a', 'reminder', 'for'], ['set', 'a', 'reminder'],
  ['add', 'a', 'reminder', 'to'], ['add', 'a', 'reminder'], ['reminder', 'to'],
  ["don't", 'forget', 'to'], ["don't", 'forget'], ['dont', 'forget', 'to'], ['do', 'not', 'forget', 'to'],
  ['remember', 'to'],
];
const FILLERS = [
  ['add', 'a', 'task', 'to'], ['add', 'a', 'task'], ['add', 'task'], ['new', 'task'],
  ['create', 'a', 'task', 'to'], ['create', 'a', 'task'], ['i', 'need', 'to'], ['i', 'have', 'to'], ['i', 'must'],
];

function enRemindOrFiller(toks: Token[], i: number, ctx: MatchCtx): Match | null {
  const r = seqLen(toks, i, REMIND);
  if (r) return { len: r, fx: { remind: true } };
  if (wAt(toks, i) === 'please') return { len: 1, fx: {}, filler: true };
  const f = ctx.atStart ? seqLen(toks, i, FILLERS) : 0;
  return f ? { len: f, fx: {}, filler: true } : null;
}

function timeMatch(toks: Token[], i: number): Match | null {
  const t = enTime(toks, i);
  return t ? { len: t.len, fx: { clock: t.clock } } : null;
}

// Connectors left dangling once the date words are gone ("buy a gift for
// tomorrow" -> "buy a gift for"). "on"/"at"/"by" are not here: the date rules
// already take them, and "turn the lights on" must keep its "on".
const LEAD = new Set(['to', 'and', 'then']);
const TRAIL = new Set(['and', 'then', 'for']);

export const enRules: LangRules = {
  match(toks, i, ctx) {
    return (
      enRemindOrFiller(toks, i, ctx) ??
      enRelative(toks, i) ??
      enSimpleDate(toks, i) ??
      enWeekday(toks, i) ??
      enMonthDay(toks, i) ??
      enPeriod(toks, i, ctx) ??
      timeMatch(toks, i) ??
      enPriority(toks, i, ctx)
    );
  },
  finishTitle(words) {
    return trimWords(words, LEAD, TRAIL);
  },
};
