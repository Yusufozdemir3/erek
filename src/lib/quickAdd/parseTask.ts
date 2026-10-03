// Turns one spoken (or typed) sentence into task fields:
//   "yarın akşam 7'de annemi ara" -> title "Annemi ara", tomorrow, 19:00.
//
// Ground rules:
// - Nothing is saved from here. The result pre-fills the task form and the
//   user confirms, so a wrong guess is cheap — a LOST word is not. Words are
//   removed from the title only when a rule is confident; when it isn't, the
//   field may still be filled but the words stay ("Cuma namazı" keeps "Cuma").
// - Of several expressions for the same field, a confident one beats an
//   unsure one, then the first one wins; the others stay in the title.
// - Pure and deterministic: `now` is injected, the input is capped.

import type { Lang } from '@/i18n/translations';
import type { Priority } from '@/types/models';
import { toYmd } from '@/lib/helpers';
import {
  capitalize,
  tokenize,
  type ClockSpec,
  type DateSpec,
  type Effects,
  type LangRules,
  type Match,
  type Period,
} from './core';
import { deRules } from './de';
import { enRules } from './en';
import { trRules } from './tr';

export const MAX_INPUT_CHARS = 300;

const RULES: Record<Lang, LangRules> = { tr: trRules, en: enRules, de: deRules };

export interface ParsedTask {
  title: string; // '' = the sentence had no words left besides date/time
  date: string | null; // "YYYY-MM-DD"
  time: string | null; // "HH:MM"
  priority: Priority | null;
  remind: boolean; // "... hatırlat" / "remind me ..."
}

type Field = 'date' | 'period' | 'clock' | 'priority';

function fieldsOf(fx: Effects): Field[] {
  const f: Field[] = [];
  if (fx.date) f.push('date');
  if (fx.period) f.push('period');
  if (fx.clock) f.push('clock');
  if (fx.relMinutes !== undefined) f.push('date', 'period', 'clock');
  if (fx.priority) f.push('priority');
  return f;
}

const TITLE_EDGE = /^[\s.,;:!?…\-–—]+|[\s.,;:!?…\-–—]+$/g;

export function parseTask(text: string, lang: Lang, now: Date): ParsedTask {
  const rules = RULES[lang];
  const toks = tokenize(text.slice(0, MAX_INPUT_CHARS), lang);

  // 1. Scan left to right; matches never overlap.
  const found: { at: number; m: Match }[] = [];
  let prev: Match | null = null;
  let plainSeen = false;
  for (let i = 0; i < toks.length; ) {
    const m = rules.match(toks, i, { prev, atStart: !plainSeen });
    if (m && m.len > 0) {
      found.push({ at: i, m });
      if (m.weak) plainSeen = true; // its words stay in the title
      prev = m;
      i += m.len;
    } else {
      plainSeen = true;
      prev = null;
      i += 1;
    }
  }

  // 2. Pick: confident matches first, then unsure ones; first come first served.
  // A date that doesn't exist ("29 Şubat" in 2027) is not applied, so its
  // words stay in the title instead of vanishing.
  const today = startOfDay(now);
  const fx: Effects = {};
  const taken = new Set<Field>();
  const consumed = new Set<number>();
  let filler = false;
  const consume = (at: number, len: number) => {
    for (let k = at; k < at + len; k++) consumed.add(k);
  };
  const ordered = [...found.filter((f) => !f.m.weak), ...found.filter((f) => f.m.weak)];
  for (const { at, m } of ordered) {
    if (m.filler) {
      filler = true;
      consume(at, m.len);
      continue;
    }
    const fields = fieldsOf(m.fx);
    if (fields.some((f) => taken.has(f))) continue;
    if (m.fx.date && !resolveDate(m.fx.date, today)) continue;
    fields.forEach((f) => taken.add(f));
    if (m.fx.date) fx.date = m.fx.date;
    if (m.fx.period) fx.period = m.fx.period;
    if (m.fx.clock) fx.clock = m.fx.clock;
    if (m.fx.relMinutes !== undefined) fx.relMinutes = m.fx.relMinutes;
    if (m.fx.priority) fx.priority = m.fx.priority;
    if (m.fx.remind) fx.remind = true;
    if (!m.weak) consume(at, m.len);
  }

  // 3. Resolve against `now`.
  const { date, time } = resolveWhen(fx, now);

  // 4. Title from the leftover words.
  const words = toks.filter((_, k) => !consumed.has(k));
  const kept = rules.finishTitle(words, { remind: !!fx.remind, filler });
  const title = capitalize(
    kept
      .map((t) => t.text)
      .join(' ')
      .replace(TITLE_EDGE, '')
      .replace(/\s+/g, ' '),
    lang
  );

  return { title, date, time, priority: fx.priority ?? null, remind: !!fx.remind };
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function validDate(y: number, month: number, day: number): Date | null {
  const d = new Date(y, month - 1, day);
  return d.getMonth() === month - 1 && d.getDate() === day ? d : null;
}

function resolveDate(spec: DateSpec, today: Date): Date | null {
  switch (spec.kind) {
    case 'offset':
      return addDays(today, spec.days);
    case 'weekday': {
      if (spec.nextWeek) {
        // Weeks start on Monday (same as weekStartOf in helpers).
        const monday = addDays(today, -((today.getDay() + 6) % 7));
        return addDays(monday, 7 + ((spec.wd + 6) % 7));
      }
      return addDays(today, (spec.wd - today.getDay() + 7) % 7);
    }
    case 'monthDay': {
      const y = today.getFullYear();
      if (spec.month) {
        const d = validDate(y, spec.month, spec.day);
        if (!d) return null; // 29 Feb in a non-leap year: not a date to guess around
        // A date that already passed this year means next year.
        return d >= today ? d : validDate(y + 1, spec.month, spec.day);
      }
      const m = today.getMonth() + 1;
      const d = validDate(y, m, spec.day);
      if (d && d >= today) return d;
      return m === 12 ? validDate(y + 1, 1, spec.day) : validDate(y, m + 1, spec.day);
    }
  }
}

const PERIOD_DEFAULT: Record<Period, number> = {
  morning: 9 * 60,
  noon: 12 * 60,
  afternoon: 15 * 60,
  evening: 19 * 60,
  night: 21 * 60,
};

// Minutes after midnight. nowMin is set only when the day is today.
function resolveMinutes(clock: ClockSpec | undefined, period: Period | undefined, nowMin: number | null): number {
  if (!clock) return PERIOD_DEFAULT[period ?? 'morning'];
  const { h, m } = clock;
  if (clock.exact) return h * 60 + m;
  if (clock.ampm) return ((h % 12) + (clock.ampm === 'pm' ? 12 : 0)) * 60 + m;
  // h is 1-12 from here on.
  if (period) {
    switch (period) {
      case 'morning':
        return (h % 12) * 60 + m;
      case 'noon': // "öğlen 1" = 13:00
        return (h <= 5 ? h + 12 : h) * 60 + m;
      case 'afternoon':
        return (h < 12 ? h + 12 : 12) * 60 + m;
      case 'evening': // "akşam 12" = midnight
        return (h === 12 ? 0 : h + 12) * 60 + m;
      case 'night': // "gece 2" = 02:00, "gece 11" = 23:00
        return (h === 12 ? 0 : h <= 5 ? h : h + 12) * 60 + m;
    }
  }
  if (h === 12) return 12 * 60 + m;
  if (h <= 6) return (h + 12) * 60 + m; // "saat 3'te" means the afternoon
  // 7-11: the next time the clock shows it today (what Assistant does);
  // on another day, the morning.
  if (nowMin !== null) {
    if (h * 60 + m > nowMin) return h * 60 + m;
    if ((h + 12) * 60 + m > nowMin) return (h + 12) * 60 + m;
  }
  return h * 60 + m;
}

const pad = (n: number) => String(n).padStart(2, '0');

function resolveWhen(fx: Effects, now: Date): { date: string | null; time: string | null } {
  const today = startOfDay(now);
  if (fx.relMinutes !== undefined) {
    const at = new Date(now.getTime() + fx.relMinutes * 60_000);
    return { date: toYmd(at), time: `${pad(at.getHours())}:${pad(at.getMinutes())}` };
  }
  let day = fx.date ? resolveDate(fx.date, today) : null;
  const explicitDay = day !== null;
  if (!fx.clock && !fx.period) return { date: day ? toYmd(day) : null, time: null };
  day = day ?? today;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = day.getTime() === today.getTime();
  const min = resolveMinutes(fx.clock, fx.period, isToday ? nowMin : null);
  // "saat 3'te" said at 16:00 means tomorrow — but "bugün saat 3'te" is kept
  // as said (the user named the day).
  if (!explicitDay && min <= nowMin) day = addDays(today, 1);
  return { date: toYmd(day), time: `${pad(Math.floor(min / 60))}:${pad(min % 60)}` };
}
