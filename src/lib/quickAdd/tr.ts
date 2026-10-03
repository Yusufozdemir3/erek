// Turkish rules for the quick-add parser (see parseTask.ts).
//
// Turkish puts case endings on the word itself ("cumaya", "3'te", "Ekim'de"),
// so rules look at a word's base + ending. Words that are also ordinary nouns
// are treated carefully: "pazar" is Sunday AND market, so it only counts with
// a clear marker ("pazar günü", "bu pazar"); "akşam yemeği" keeps "akşam" in
// the title; a bare number is never a time ("3 ekmek al").

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

type Case = 'nom' | 'loc' | 'acc' | 'dat' | 'other';

// Number words in the cases a time expression uses:
// "üç" / "üçte" (at 3) / "üçü çeyrek geçe" / "dörde çeyrek kala".
const NUM: Record<string, [number, Case] | undefined> = {};
function addNum(n: number, nom: string, loc: string, acc: string, dat: string): void {
  NUM[nom] = [n, 'nom'];
  NUM[loc] = [n, 'loc'];
  NUM[acc] = [n, 'acc'];
  NUM[dat] = [n, 'dat'];
}
addNum(1, 'bir', 'birde', 'biri', 'bire');
addNum(2, 'iki', 'ikide', 'ikiyi', 'ikiye');
addNum(3, 'üç', 'üçte', 'üçü', 'üçe');
addNum(4, 'dört', 'dörtte', 'dördü', 'dörde');
addNum(5, 'beş', 'beşte', 'beşi', 'beşe');
addNum(6, 'altı', 'altıda', 'altıyı', 'altıya');
addNum(7, 'yedi', 'yedide', 'yediyi', 'yediye');
addNum(8, 'sekiz', 'sekizde', 'sekizi', 'sekize');
addNum(9, 'dokuz', 'dokuzda', 'dokuzu', 'dokuza');
addNum(10, 'on', 'onda', 'onu', 'ona');
addNum(20, 'yirmi', 'yirmide', 'yirmiyi', 'yirmiye');
addNum(30, 'otuz', 'otuzda', 'otuzu', 'otuza');

// The ending written after an apostrophe on a digit: "3'te", "3'ü", "4'e".
function sfxCase(sfx: string): Case {
  if (!sfx) return 'nom';
  if (/^[td][ae]$/.test(sfx)) return 'loc';
  if (/^y?[ıiuü]$/.test(sfx)) return 'acc';
  if (/^y?[ae]$/.test(sfx)) return 'dat';
  return 'other';
}

interface Num {
  n: number;
  len: number;
  cs: Case;
}

function num(toks: Token[], i: number): Num | null {
  const t = toks[i];
  if (!t) return null;
  if (/^\d{1,2}$/.test(t.base)) return { n: Number(t.base), len: 1, cs: sfxCase(t.sfx) };
  const a = NUM[t.w];
  if (!a) return null;
  // "on bir", "yirmi üçte": the ending sits on the last word.
  const b = a[0] >= 10 && a[1] === 'nom' ? NUM[wAt(toks, i + 1)] : undefined;
  if (b && b[0] < 10) return { n: a[0] + b[0], len: 2, cs: b[1] };
  return { n: a[0], len: 1, cs: a[1] };
}

function minutes(toks: Token[], i: number): { m: number; len: number } | null {
  if (wAt(toks, i) === 'çeyrek') return { m: 15, len: 1 };
  const n = num(toks, i);
  return n && n.cs === 'nom' && n.n >= 1 && n.n <= 59 ? { m: n.n, len: n.len } : null;
}

function trTime(toks: Token[], i: number): { clock: ClockSpec; len: number } | null {
  const saat = wAt(toks, i) === 'saat';
  const j = saat ? i + 1 : i;
  const t = toks[j];
  if (!t) return null;

  // "15:30", "15:30'da", "saat 9.45"
  const c = CLOCK_RE.exec(t.base);
  if (c) {
    if (!(t.base.includes(':') || saat || sfxCase(t.sfx) === 'loc')) return null;
    const h = Number(c[1]);
    const m = Number(c[2]);
    if (h > 24 || m > 59) return null;
    const clock = clockOf(h, m);
    if (c[1].startsWith('0')) clock.exact = true; // "09:30" is the morning
    return { clock, len: j - i + 1 };
  }

  const n = num(toks, j);
  if (!n || n.n > 24) return null;
  const k = j + n.len;
  const next = wAt(toks, k);
  // "üç buçukta", "saat 3 buçuk"
  if (next === 'buçuk' || next === 'buçukta') {
    return next === 'buçukta' || saat ? { clock: clockOf(n.n, 30), len: k - i + 1 } : null;
  }
  // "6'ya kadar", "saat beşe kadar" (a deadline); a bare "ona kadar" is more
  // likely "up to ten"/"until him" than 10 o'clock.
  if (n.cs === 'dat' && next === 'kadar' && (saat || t.w !== 'ona')) {
    return { clock: clockOf(n.n, 0), len: k - i + 1 };
  }
  // "üçü çeyrek geçe" (3:15), "dörde on kala" (3:50)
  if (n.cs === 'acc' || n.cs === 'dat') {
    const mm = minutes(toks, k);
    if (!mm) return null;
    const end = wAt(toks, k + mm.len);
    const len = k + mm.len - i + 1;
    if (n.cs === 'acc' && end === 'geçe') return { clock: clockOf(n.n, mm.m), len };
    if (n.cs === 'dat' && (end === 'kala' || end === 'var')) {
      return { clock: clockOf(n.n === 1 ? 12 : n.n - 1, 60 - mm.m), len };
    }
    return null;
  }
  // "3'te", "üçte", "saat 3", "saat on beşte"
  if (n.cs === 'loc' || (saat && n.cs === 'nom')) return { clock: clockOf(n.n, 0), len: k - i };
  return null;
}

const PERIOD_NOUN: Record<string, Period | undefined> = {
  sabah: 'morning',
  sabahı: 'morning',
  öğle: 'noon',
  ikindi: 'afternoon',
  akşam: 'evening',
  akşamı: 'evening',
  gece: 'night',
  gecesi: 'night',
};
// Adverbs: a time of day on their own, no date needed.
const PERIOD_ADV: Record<string, Period | undefined> = {
  sabahleyin: 'morning',
  öğlen: 'noon',
  öğleyin: 'noon',
  akşamleyin: 'evening',
  geceleyin: 'night',
};
// "akşama kadar" = by the evening
const PERIOD_DAT: Record<string, Period | undefined> = { akşama: 'evening', öğlene: 'noon' };
// A period word followed by one of these is part of a name: "akşam yemeği",
// "sabah koşusu", "ikindi namazı".
const COMPOUND = new Set([
  'yemek', 'yemeği', 'yemeğe', 'yemeğini', 'yemeğinde',
  'kahvaltı', 'kahvaltısı', 'kahvaltıya',
  'namaz', 'namazı', 'namazına', 'namazını', 'ezanı',
  'sporu', 'koşusu', 'yürüyüşü', 'rutini', 'haberleri',
]);

function periodAt(toks: Token[], i: number): { period: Period; len: number } | null {
  if (seq(toks, i, ['öğleden', 'sonra'])) return { period: 'afternoon', len: 2 };
  const w = wAt(toks, i);
  const p = PERIOD_NOUN[w] ?? PERIOD_ADV[w];
  return p ? { period: p, len: 1 } : null;
}

function trPeriod(toks: Token[], i: number, ctx: MatchCtx): Match | null {
  const w = wAt(toks, i);
  if (w === 'bu') {
    const p = periodAt(toks, i + 1);
    if (!p) return null;
    // "bu akşam yemeği hazırla": take "bu" only, "Akşam yemeği" stays.
    const len = COMPOUND.has(wAt(toks, i + 1 + p.len)) ? 1 : 1 + p.len;
    return { len, fx: { date: offset(0), period: p.period } };
  }
  if (seq(toks, i, ['öğleden', 'sonra'])) return { len: 2, fx: { period: 'afternoon' } };
  const dat = PERIOD_DAT[w];
  if (dat) return { len: wAt(toks, i + 1) === 'kadar' ? 2 : 1, fx: { period: dat } };
  const adv = PERIOD_ADV[w];
  const noun = PERIOD_NOUN[w];
  const p = adv ?? noun;
  if (!p) return null;
  if (COMPOUND.has(wAt(toks, i + 1))) {
    return hasDateBefore(ctx) ? { len: 1, fx: { period: p }, weak: true } : null;
  }
  if (adv || hasDateBefore(ctx) || trTime(toks, i + 1)) return { len: 1, fx: { period: p } };
  return null;
}

const WEEKDAY: Record<string, number | undefined> = {
  pazartesi: 1, salı: 2, çarşamba: 3, perşembe: 4, cuma: 5, cumartesi: 6, pazar: 0,
};
// "cumaya (kadar)" = by Friday. "pazara" is deliberately missing: it's also
// "to the market".
const WEEKDAY_DAT: Record<string, number | undefined> = {
  pazartesiye: 1, salıya: 2, çarşambaya: 3, perşembeye: 4, cumaya: 5, cumartesiye: 6,
};

function trWeekday(toks: Token[], i: number): Match | null {
  const q = wAt(toks, i);
  const nextWeek = q === 'haftaya' || q === 'haftaki';
  const qualified = nextWeek || q === 'bu' || q === 'gelecek' || q === 'önümüzdeki';
  const j = qualified ? i + 1 : i;
  const w = wAt(toks, j);
  const dat = WEEKDAY_DAT[w];
  const wd = WEEKDAY[w] ?? dat;
  if (wd === undefined) return null;
  const date: DateSpec = { kind: 'weekday', wd, nextWeek };
  const after = wAt(toks, j + 1);
  const tail = after === 'günü' || (dat !== undefined && after === 'kadar') ? 1 : 0;
  const m: Match = { len: j - i + 1 + tail, fx: { date } };
  if (qualified || dat !== undefined || tail) return m;
  // "cuma akşamı", "cuma 3'te": clearly the day
  if (periodAt(toks, j + 1) || trTime(toks, j + 1)) return m;
  if (w === 'pazar') return null;
  if (j === toks.length - 1) return m; // sentence-final: "... cuma"
  return { ...m, weak: true }; // "cuma namazı": Friday, but keep the word
}

function trSimpleDate(toks: Token[], i: number): Match | null {
  const w = wAt(toks, i);
  if (w === 'bugün') return { len: 1, fx: { date: offset(0) } };
  if (w === 'yarın') return { len: 1, fx: { date: offset(1) } };
  if (w === 'yarına') return { len: wAt(toks, i + 1) === 'kadar' ? 2 : 1, fx: { date: offset(1) } };
  if (w === 'öbürgün') return { len: 1, fx: { date: offset(2) } };
  const two = seqLen(toks, i, [['öbür', 'gün'], ['yarından', 'sonra']]);
  if (two) return { len: two, fx: { date: offset(2) } };
  const week = seqLen(toks, i, [['haftaya', 'bugün'], ['haftaya'], ['gelecek', 'hafta'], ['önümüzdeki', 'hafta']]);
  if (week) return { len: week, fx: { date: offset(7) } };
  return null;
}

// "3 gün sonra", "bir hafta sonra", "2 saat sonra", "yarım saat sonra"
function trRelative(toks: Token[], i: number): Match | null {
  let n: number;
  let j: number;
  if (wAt(toks, i) === 'yarım') {
    n = 0.5;
    j = i + 1;
  } else {
    const x = num(toks, i);
    if (!x || x.cs !== 'nom' || x.n === 0) return null;
    n = x.n;
    j = i + x.len;
    if (wAt(toks, j) === 'buçuk') {
      n += 0.5;
      j += 1;
    }
  }
  if (wAt(toks, j + 1) !== 'sonra') return null;
  const unit = wAt(toks, j);
  const len = j - i + 2;
  const whole = Number.isInteger(n);
  if (unit === 'saat') return { len, fx: { relMinutes: Math.round(n * 60) } };
  if (unit === 'dakika' && whole) return { len, fx: { relMinutes: n } };
  if (unit === 'gün' && whole) return { len, fx: { date: offset(n) } };
  if (unit === 'hafta' && whole) return { len, fx: { date: offset(7 * n) } };
  return null;
}

const MONTHS = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
const MONTH_END = new Set(['', 'de', 'da', 'te', 'ta', 'e', 'a', 'ye', 'ya', 'in', 'ın', 'un', 'ün']);

function monthOf(t: Token): number | null {
  const k = MONTHS.indexOf(t.base);
  if (k >= 0) return k + 1;
  for (let m = 0; m < MONTHS.length; m++) {
    if (t.w.startsWith(MONTHS[m]) && MONTH_END.has(t.w.slice(MONTHS[m].length))) return m + 1;
  }
  return null;
}

// "15 Ekim'de", "ayın 20'sinde"
function trMonthDay(toks: Token[], i: number): Match | null {
  const kadar = (k: number) => (wAt(toks, k) === 'kadar' ? 1 : 0);
  if (wAt(toks, i) === 'ayın') {
    const d = num(toks, i + 1);
    if (!d || d.n < 1 || d.n > 31) return null;
    const len = 1 + d.len;
    return { len: len + kadar(i + len), fx: { date: { kind: 'monthDay', day: d.n } } };
  }
  const d = num(toks, i);
  if (!d || d.cs !== 'nom' || d.n < 1 || d.n > 31) return null;
  const mt = toks[i + d.len];
  const month = mt ? monthOf(mt) : null;
  if (!month || !plausibleDay(month, d.n)) return null;
  const len = d.len + 1;
  return { len: len + kadar(i + len), fx: { date: { kind: 'monthDay', day: d.n, month } } };
}

const LEVEL: Record<string, Priority | undefined> = { yüksek: 'high', düşük: 'low', orta: 'medium' };
const MARK = new Set(['acil', 'önemli']);

function trPriority(toks: Token[], i: number, ctx: MatchCtx): Match | null {
  const w = wAt(toks, i);
  const lvl = LEVEL[w];
  if (lvl && /^öncelik(li)?$/.test(wAt(toks, i + 1))) {
    return { len: wAt(toks, i + 2) === 'olarak' ? 3 : 2, fx: { priority: lvl } };
  }
  if (w === 'öncelik' || w === 'önceliği') {
    const l2 = LEVEL[wAt(toks, i + 1)];
    return l2 ? { len: 2, fx: { priority: l2 } } : null;
  }
  if (w === 'öncelikli') return { len: wAt(toks, i + 1) === 'olarak' ? 2 : 1, fx: { priority: 'high' } };
  if (w === 'acilen') return { len: 1, fx: { priority: 'high' } };
  // "acil" / "önemli": removed at the end of the sentence ("faturayı öde
  // acil"); at the start they may be part of the name ("acil durum çantası"),
  // so they only set the priority there.
  const len = w === 'çok' && MARK.has(wAt(toks, i + 1)) ? 2 : MARK.has(w) ? 1 : 0;
  if (!len) return null;
  if (wAt(toks, i + len) === 'olarak') return { len: len + 1, fx: { priority: 'high' } };
  if (i + len === toks.length) return { len, fx: { priority: 'high' } };
  return ctx.atStart ? { len, fx: { priority: 'high' }, weak: true } : null;
}

const REMIND = new Set(['hatırlat', 'hatırlatsana', 'hatırlatın', 'anımsat', 'unutma', 'unutmayayım', 'unutmayın']);
const SET_VERBS = new Set(['kur', 'ekle', 'oluştur', 'koy']);

function trRemind(toks: Token[], i: number): Match | null {
  const w = wAt(toks, i);
  if (w === 'hatırlatır' && /^m[ıi]s[ıi]n(ız)?$/.test(wAt(toks, i + 1))) return { len: 2, fx: { remind: true } };
  if (REMIND.has(w)) return { len: 1, fx: { remind: true } };
  if ((w === 'hatırlatma' || w === 'hatırlatıcı') && SET_VERBS.has(wAt(toks, i + 1))) {
    return { len: 2, fx: { remind: true } };
  }
  return null;
}

const FILLERS = [
  ['yeni', 'bir', 'görev', 'ekle'],
  ['yeni', 'görev', 'ekle'],
  ['bir', 'görev', 'ekle'],
  ['yeni', 'bir', 'görev'],
  ['yeni', 'görev'],
  ['görev', 'ekle'],
  ['görev', 'oluştur'],
];

function trFiller(toks: Token[], i: number, ctx: MatchCtx): Match | null {
  if (wAt(toks, i) === 'lütfen') return { len: 1, fx: {}, filler: true };
  if (!ctx.atStart) return null;
  const len = seqLen(toks, i, FILLERS);
  return len ? { len, fx: {}, filler: true } : null;
}

function timeMatch(toks: Token[], i: number): Match | null {
  const t = trTime(toks, i);
  return t ? { len: t.len, fx: { clock: t.clock } } : null;
}

// Connectors left dangling once the date words are gone ("yarın için X" ->
// "için X"). Kept short on purpose: every word here is deleted from real
// titles too ("saat al" must stay "Saat al").
const LEAD = new Set(['için', 've', 'de', 'da', 'olarak']);
const TRAIL = new Set(['için', 've', 'olarak']);
const LEAD_REMIND = new Set([...LEAD, 'bana']);
const TRAIL_REMIND = new Set([...TRAIL, 'bana']);
// "annemi aramayı hatırlat" / "ilacımı almamı hatırlat": the verbal noun
// becomes the imperative ("ara", "al") — what a to-do title looks like.
const VERBAL_NOUN = /^(.{2,})m[ae](?:y[ıi]|m[ıi])$/;

export const trRules: LangRules = {
  match(toks, i, ctx) {
    return (
      trRemind(toks, i) ??
      trFiller(toks, i, ctx) ??
      trRelative(toks, i) ??
      trMonthDay(toks, i) ??
      trWeekday(toks, i) ??
      trSimpleDate(toks, i) ??
      trPeriod(toks, i, ctx) ??
      timeMatch(toks, i) ??
      trPriority(toks, i, ctx)
    );
  },
  finishTitle(words, ctx) {
    const out = trimWords(words, ctx.remind ? LEAD_REMIND : LEAD, ctx.remind ? TRAIL_REMIND : TRAIL);
    const last = out[out.length - 1];
    if (ctx.remind && last) {
      const m = VERBAL_NOUN.exec(last.w);
      if (m && last.w.length >= 5) out[out.length - 1] = respell(last, last.raw.slice(0, m[1].length));
    }
    return out;
  },
};
