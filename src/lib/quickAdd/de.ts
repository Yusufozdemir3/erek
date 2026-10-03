// German rules for the quick-add parser (see parseTask.ts).
// Traps handled: "halb drei" is 2:30 (not 3:30); "morgen" is tomorrow but
// "heute Morgen" is this morning; "Freitagabend" is one word; "15.10." is a
// date while "um 15.30" is a time. A bare number is never a time.

import type { Priority } from '@/types/models';
import {
  CLOCK_RE,
  clockOf,
  hasDateBefore,
  offset,
  plausibleDay,
  respell,
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
  ein: 1, eins: 1, eine: 1, einen: 1, einem: 1, einer: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fünf: 5,
  sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
};

function count(w: string): number | null {
  if (/^\d{1,3}$/.test(w)) return Number(w);
  return NUM[w] ?? null;
}

function hour(w: string): number | null {
  if (/^\d{1,2}$/.test(w)) {
    const h = Number(w);
    return h <= 24 ? h : null;
  }
  return NUM[w] ?? null;
}

const PRE = new Set(['um', 'gegen', 'bis', 'ab']);

function deTime(toks: Token[], i: number): { clock: ClockSpec; len: number } | null {
  const pre = PRE.has(wAt(toks, i));
  const j = pre ? i + 1 : i;
  const w = wAt(toks, j);
  if (!w) return null;
  const uhr = (k: number) => (wAt(toks, k) === 'uhr' ? 1 : 0);

  if (w === 'mitternacht') return { clock: { h: 0, m: 0, exact: true }, len: j + 1 - i };

  // "halb drei" = 2:30, "dreiviertel vier" = 3:45
  if (w === 'halb' || w === 'dreiviertel') {
    const h = hour(wAt(toks, j + 1));
    if (h === null || h < 1 || h > 12) return null;
    const clock = clockOf(h === 1 ? 12 : h - 1, w === 'halb' ? 30 : 45);
    return { clock, len: j + 2 - i + uhr(j + 2) };
  }
  // "viertel nach drei" = 3:15, "viertel vor vier" = 3:45
  if (w === 'viertel') {
    const dir = wAt(toks, j + 1);
    const h = hour(wAt(toks, j + 2));
    if ((dir !== 'nach' && dir !== 'vor') || h === null || h < 1 || h > 12) return null;
    const clock = dir === 'nach' ? clockOf(h, 15) : clockOf(h === 1 ? 12 : h - 1, 45);
    return { clock, len: j + 3 - i };
  }

  // "15:30", "um 15.30 Uhr"
  const c = CLOCK_RE.exec(w);
  if (c) {
    if (!(w.includes(':') || pre || uhr(j + 1))) return null;
    const h = Number(c[1]);
    const m = Number(c[2]);
    if (h > 24 || m > 59) return null;
    const clock = clockOf(h, m);
    if (c[1].startsWith('0')) clock.exact = true;
    return { clock, len: j + 1 - i + uhr(j + 1) };
  }

  // "9 Uhr", "15 Uhr 30", "um 9", "um neun"
  const h = hour(w);
  if (h === null) return null;
  if (uhr(j + 1)) {
    const mt = wAt(toks, j + 2);
    if (/^\d{1,2}$/.test(mt) && Number(mt) <= 59) return { clock: clockOf(h, Number(mt)), len: j + 3 - i };
    return { clock: clockOf(h, 0), len: j + 2 - i };
  }
  return pre ? { clock: clockOf(h, 0), len: j + 1 - i } : null;
}

const NOUN: Record<string, Period | undefined> = {
  morgen: 'morning', vormittag: 'morning', mittag: 'noon', nachmittag: 'afternoon', abend: 'evening', nacht: 'night',
};
const ADV: Record<string, Period | undefined> = {
  morgens: 'morning', vormittags: 'morning', mittags: 'noon', nachmittags: 'afternoon', abends: 'evening', nachts: 'night',
};

function dePeriod(toks: Token[], i: number, ctx: MatchCtx): Match | null {
  const w = wAt(toks, i);
  const adv = ADV[w];
  if (adv) return { len: 1, fx: { period: adv } };
  if (w === 'am') {
    const p = NOUN[wAt(toks, i + 1)];
    return p && p !== 'night' ? { len: 2, fx: { period: p } } : null;
  }
  if (seq(toks, i, ['in', 'der', 'nacht'])) return { len: 3, fx: { period: 'night' } };
  // "heute Morgen", "morgen Abend", "morgen früh", "Freitag Abend"
  if (!hasDateBefore(ctx)) return null;
  if (w === 'früh') return { len: 1, fx: { period: 'morning' } };
  const p = NOUN[w];
  return p ? { len: 1, fx: { period: p } } : null;
}

const WEEKDAY: Record<string, number | undefined> = {
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonnabend: 6,
};
const WEEKDAY_PERIOD =
  /^(sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend)(morgen|vormittag|mittag|nachmittag|abend|nacht)$/;
const QUAL_THIS = new Set(['am', 'diesen', 'kommenden', 'bis', 'ab']);
const QUAL_NEXT = new Set(['nächsten', 'nächster', 'nächste']);

function deWeekday(toks: Token[], i: number): Match | null {
  let j = QUAL_THIS.has(wAt(toks, i)) ? i + 1 : i;
  let nextWeek = false;
  if (QUAL_NEXT.has(wAt(toks, j))) {
    nextWeek = true; // "nächsten Freitag", "am nächsten Freitag"
    j++;
  }
  const w = wAt(toks, j);
  const comp = WEEKDAY_PERIOD.exec(w);
  const wd = comp ? WEEKDAY[comp[1]] : WEEKDAY[w];
  if (wd === undefined) return null;
  const date: DateSpec = { kind: 'weekday', wd, nextWeek };
  const len = j - i + 1;
  if (comp) return { len, fx: { date, period: NOUN[comp[2]] } }; // "Freitagabend"
  const m: Match = { len, fx: { date } };
  if (j > i) return m;
  const next = wAt(toks, j + 1);
  if (deTime(toks, j + 1) || NOUN[next] || ADV[next]) return m;
  if (j === toks.length - 1) return m;
  return { ...m, weak: true };
}

const MONTH: Record<string, number | undefined> = {
  januar: 1, jänner: 1, jan: 1, februar: 2, feb: 2, märz: 3, mär: 3, april: 4, apr: 4, mai: 5, juni: 6, jun: 6,
  juli: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10,
  november: 11, nov: 11, dezember: 12, dez: 12,
};

// "am 15. Oktober", "15.10.", "am 15."
function deMonthDay(toks: Token[], i: number): Match | null {
  let k = i;
  if (['am', 'bis', 'zum', 'ab', 'vom'].includes(wAt(toks, k))) k++;
  const t = toks[k];
  if (!t) return null;
  const prefixed = k > i;
  const dm = /^(\d{1,2})\.(\d{1,2})$/.exec(t.w);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    // "15.10." / "am 15.10" — without the dot or "am" it could be a time.
    if ((t.dot || prefixed) && plausibleDay(month, day)) {
      return { len: k - i + 1, fx: { date: { kind: 'monthDay', day, month } } };
    }
    return null;
  }
  if (!/^\d{1,2}$/.test(t.w)) return null;
  const day = Number(t.w);
  const month = MONTH[wAt(toks, k + 1)];
  if (month !== undefined) {
    return plausibleDay(month, day) ? { len: k - i + 2, fx: { date: { kind: 'monthDay', day, month } } } : null;
  }
  if (prefixed && t.dot && day >= 1 && day <= 31) return { len: k - i + 1, fx: { date: { kind: 'monthDay', day } } };
  return null;
}

function deSimpleDate(toks: Token[], i: number): Match | null {
  const w = wAt(toks, i);
  if (w === 'heute') return { len: 1, fx: { date: offset(0) } };
  if (w === 'morgen') return { len: 1, fx: { date: offset(1) } };
  if (w === 'übermorgen') return { len: 1, fx: { date: offset(2) } };
  const week = seqLen(toks, i, [['nächste', 'woche'], ['nächster', 'woche'], ['kommende', 'woche'], ['in', 'der', 'nächsten', 'woche']]);
  if (week) return { len: week, fx: { date: offset(7) } };
  if (w === 'in') {
    const n = count(wAt(toks, i + 1));
    const u = wAt(toks, i + 2);
    if (n !== null && (u === 'tagen' || u === 'tag')) return { len: 3, fx: { date: offset(n) } };
    if (n !== null && (u === 'wochen' || u === 'woche')) return { len: 3, fx: { date: offset(7 * n) } };
  }
  return null;
}

// "in 2 Stunden", "in einer halben Stunde", "in 30 Minuten"
function deRelative(toks: Token[], i: number): Match | null {
  if (wAt(toks, i) !== 'in') return null;
  const half = seqLen(toks, i + 1, [['einer', 'halben', 'stunde'], ['einer', 'halbe', 'stunde']]);
  if (half) return { len: 1 + half, fx: { relMinutes: 30 } };
  const w1 = wAt(toks, i + 1);
  const n = w1 === 'anderthalb' || w1 === 'eineinhalb' ? 1.5 : count(w1);
  const u = wAt(toks, i + 2);
  if (n === null || n === 0) return null;
  if (u === 'stunde' || u === 'stunden') return { len: 3, fx: { relMinutes: Math.round(n * 60) } };
  if ((u === 'minute' || u === 'minuten' || u === 'min') && Number.isInteger(n)) return { len: 3, fx: { relMinutes: n } };
  return null;
}

const LEVEL: Record<string, Priority | undefined> = {
  hohe: 'high', hoher: 'high', hohen: 'high', niedrige: 'low', niedriger: 'low', niedrigen: 'low',
  mittlere: 'medium', mittlerer: 'medium', normale: 'medium', normaler: 'medium',
};
const LEVEL_PRED: Record<string, Priority | undefined> = { hoch: 'high', niedrig: 'low', mittel: 'medium', normal: 'medium' };
const MARK = new Set(['dringend', 'wichtig']);

function dePriority(toks: Token[], i: number, ctx: MatchCtx): Match | null {
  const w = wAt(toks, i);
  const j = w === 'mit' ? i + 1 : i;
  const lvl = LEVEL[wAt(toks, j)];
  if (lvl && wAt(toks, j + 1) === 'priorität') return { len: j - i + 2, fx: { priority: lvl } };
  if (j > i) return null;
  if (w === 'priorität') {
    const l2 = LEVEL_PRED[wAt(toks, i + 1)];
    return l2 ? { len: 2, fx: { priority: l2 } } : null;
  }
  if (w === 'asap') return { len: 1, fx: { priority: 'high' } };
  const len = w === 'sehr' && MARK.has(wAt(toks, i + 1)) ? 2 : MARK.has(w) ? 1 : 0;
  if (!len) return null;
  if (i + len === toks.length) return { len, fx: { priority: 'high' } };
  return ctx.atStart ? { len, fx: { priority: 'high' }, weak: true } : null;
}

const REMIND = [
  ['erinnere', 'mich', 'daran'], ['erinnere', 'mich', 'an'], ['erinnere', 'mich'],
  ['erinner', 'mich', 'daran'], ['erinner', 'mich', 'an'], ['erinner', 'mich'],
  ['erinnerung'], ['vergiss', 'nicht'], ['nicht', 'vergessen'],
];
const FILLERS = [['neue', 'aufgabe'], ['aufgabe', 'hinzufügen'], ['ich', 'muss'], ['ich', 'sollte']];

function deRemindOrFiller(toks: Token[], i: number, ctx: MatchCtx): Match | null {
  const r = seqLen(toks, i, REMIND);
  if (r) return { len: r, fx: { remind: true } };
  if (wAt(toks, i) === 'bitte') return { len: 1, fx: {}, filler: true };
  const f = ctx.atStart ? seqLen(toks, i, FILLERS) : 0;
  return f ? { len: f, fx: {}, filler: true } : null;
}

function timeMatch(toks: Token[], i: number): Match | null {
  const t = deTime(toks, i);
  return t ? { len: t.len, fx: { clock: t.clock } } : null;
}

// Connectors left dangling once the date words are gone. "am"/"um"/"bis"/"zu"
// are not here: the date rules already take them, and "am Bahnhof" or "zu
// Hause" must survive. After "erinnere mich (an|daran)" the leftover
// "daran, dass ich ..." / "den Termin" loses its glue words too.
const LEAD = new Set(['und', 'dann']);
const TRAIL = new Set(['und', 'dann']);
const LEAD_REMIND = new Set([...LEAD, 'daran', 'dass', 'ich', 'an', 'den', 'die', 'das', 'dem', 'der', 'einen', 'eine', 'ein']);
// "Mama anzurufen" (after "erinnere mich daran") -> "Mama anrufen"
const SEPARABLE_ZU =
  /^(ab|an|auf|aus|bei|ein|fest|her|hin|los|mit|nach|vor|weg|zurück|zusammen|weiter|um|durch|heim|frei)zu([a-zäöüß]{2,}en)$/;

export const deRules: LangRules = {
  match(toks, i, ctx) {
    return (
      deRemindOrFiller(toks, i, ctx) ??
      deRelative(toks, i) ??
      dePeriod(toks, i, ctx) ??
      deWeekday(toks, i) ??
      deMonthDay(toks, i) ??
      deSimpleDate(toks, i) ??
      timeMatch(toks, i) ??
      dePriority(toks, i, ctx)
    );
  },
  finishTitle(words, ctx) {
    const out = trimWords(words, ctx.remind ? LEAD_REMIND : LEAD, TRAIL);
    if (!ctx.remind || out.length === 0) return out;
    // "Blumen zu gießen" -> "Blumen gießen"
    if (out.length >= 2 && out[out.length - 2].w === 'zu') return [...out.slice(0, -2), out[out.length - 1]];
    const last = out[out.length - 1];
    const m = SEPARABLE_ZU.exec(last.w);
    if (m) {
      const p = m[1].length;
      out[out.length - 1] = respell(last, last.raw.slice(0, p) + last.raw.slice(p + 2));
    }
    return out;
  },
};
