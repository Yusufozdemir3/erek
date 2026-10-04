// "Su içtim", "iki bardak su içtim", "I finished the shopping task": turns a
// spoken sentence into a command on something the user already has — tick a
// habit, add an amount to a counting habit, complete a task. Pure logic; the
// Today screen asks the user to confirm and offers undo (ui/VoiceCommandBar).
//
// A sentence is only a command when it (1) says something is DONE — a past
// tense verb or a "done/bitti/erledigt" word — and (2) clearly names one of
// the items offered. Everything else returns 'none' and the caller falls back
// to adding a task, so a new to-do is never swallowed as a command.
//
// Words are compared on folded text (no diacritics, no case) with light
// per-language stemming: Turkish suffixes ("okudum" ~ "oku"), English
// irregular pasts ("drank" ~ "drink"), German participles ("gelesen" ~ "lesen").
// No regex runs over the whole sentence: only per-word checks.

import type { Lang } from '@/i18n/translations';
import { tokenize } from '@/lib/quickAdd/core';
import { fold } from '@/lib/textFold';

export interface CommandHabit {
  id: string;
  title: string;
  kind: 'binary' | 'numeric' | 'timer';
}

export interface CommandTask {
  id: string;
  title: string;
}

export interface CommandGoal {
  id: string;
  title: string;
}

export interface CommandItems {
  habits: CommandHabit[]; // today's habits that can still take a command
  tasks: CommandTask[]; // open tasks
  goals?: CommandGoal[]; // the user's own counting (numeric) goals
}

export type Target =
  | { kind: 'habit'; habit: CommandHabit; amount: number } // amount: what to add (numeric) — 1 for binary
  | { kind: 'task'; task: CommandTask }
  | { kind: 'postpone'; task: CommandTask } // "move X to tomorrow"
  | { kind: 'goal'; goal: CommandGoal; amount: number }; // "add 5 km to my running goal"

export type VoiceCommand =
  | { kind: 'none' }
  | { kind: 'one'; target: Target }
  | { kind: 'choose'; options: Target[] }; // several fit equally well (2-3)

export const MIN_COVERAGE = 0.6; // share of the spoken content words that must match
const MAX_OPTIONS = 3;
const TIE_MARGIN = 0.15;
const MAX_AMOUNT = 999;

// — Numbers (words and digits) —
const NUM_WORDS: Record<Lang, Record<string, number>> = {
  tr: {
    bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10,
    yirmi: 20, otuz: 30, kirk: 40, elli: 50, altmis: 60, yuz: 100,
  },
  en: {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
    hundred: 100,
  },
  de: {
    ein: 1, eine: 1, eins: 1, zwei: 2, drei: 3, vier: 4, funf: 5, sechs: 6, sieben: 7, acht: 8,
    neun: 9, zehn: 10, elf: 11, zwolf: 12, funfzehn: 15, zwanzig: 20, dreissig: 30, vierzig: 40,
    funfzig: 50, sechzig: 60, hundert: 100,
  },
};
const TENS = new Set([20, 30, 40, 50, 60]);

// The whole number starting at words[i]: [value, words used] or null. "yirmi beş",
// "twenty five" are two words; "bir" before a non-unit is handled by the caller.
function wholeNumberAt(words: string[], i: number, lang: Lang): [number, number] | null {
  const w = words[i];
  if (/^\d{1,4}$/.test(w)) return [Math.min(Number(w), MAX_AMOUNT), 1];
  const v = NUM_WORDS[lang][w];
  if (v === undefined) return null;
  if (TENS.has(v) && lang !== 'de') {
    const next = NUM_WORDS[lang][words[i + 1] ?? ''];
    if (next !== undefined && next >= 1 && next <= 9) return [v + next, 2];
  }
  return [v, 1];
}

// One digit said after "point"/"komma": "two point five" -> 5.
function digitAt(words: string[], i: number, lang: Lang): number | null {
  const w = words[i] ?? '';
  const d = /^\d$/.test(w) ? Number(w) : NUM_WORDS[lang][w];
  return d !== undefined && d >= 0 && d <= 9 ? d : null;
}

// The number starting at words[i], with halves and decimals as people say them:
// "2,5" / "2.5", "iki buçuk", "two and a half", "two point five", "zweieinhalb",
// "zwei komma fünf". Rounded to 2 decimals so sums don't drift.
function numberAt(words: string[], i: number, lang: Lang): [number, number] | null {
  const w = words[i];
  if (/^\d{1,4}[.,]\d{1,2}$/.test(w)) return [Math.min(Math.round(Number(w.replace(',', '.')) * 100) / 100, MAX_AMOUNT), 1];
  if (lang === 'de') {
    if (w === 'anderthalb') return [1.5, 1];
    const m = /^(.+)einhalb$/.exec(w);
    const whole = m ? NUM_WORDS.de[m[1]] : undefined;
    if (whole !== undefined) return [whole + 0.5, 1];
  }
  const n = wholeNumberAt(words, i, lang);
  if (!n) return null;
  const [value, used] = n;
  const at = i + used;
  if (lang === 'tr' && words[at] === 'bucuk') return [value + 0.5, used + 1];
  if (lang === 'en' && words[at] === 'and' && words[at + 1] === 'a' && words[at + 2] === 'half') return [value + 0.5, used + 3];
  if ((lang === 'en' && words[at] === 'point') || (lang === 'de' && words[at] === 'komma')) {
    const d = digitAt(words, at + 1, lang);
    if (d !== null) return [value + d / 10, used + 2];
  }
  return n;
}

// — Per-language knowledge —
interface LangKit {
  // "I did it" words that carry no item meaning of their own.
  generic: Set<string>;
  // Words that never help identify an item.
  stop: Set<string>;
  // Stems of nouns the user may say for "task/habit".
  nounPrefixes: string[];
  // Does this single word say "done"?
  isDoneWord(w: string): boolean;
  // Stem prefixes (folded) of "postpone/move" and "tomorrow".
  postponePrefixes: string[];
  tomorrowPrefixes: string[];
  // Stem prefixes of "add" and of "goal" ("add 5 km to my reading goal").
  addPrefixes: string[];
  goalPrefixes: string[];
  // Do a spoken word and a title word mean the same thing?
  same(spoken: string, title: string): boolean;
}

// — Turkish —
// Folded, so ı=i and ü=u. Endings that follow a stem in speech: past tense
// ("-dum, -tim"), accusative/dative/plural/ablative/locative, progressive.
const TR_SUFFIX = /^(?:[dt][iu][mnk]?|[dt][iu]n[iu]z|[dt][iu]k|y?[iu]|y?[ae]|n[iu]|l[ae]r|[dt][ae]n?|[iu]yor(?:um|uz)?|m[iu]s|[iu]m|[iu]n|si|su|m[ae](?:y[iu]|[dt][ae]n?|n[iu]|si)?)$/;
const SOFTEN: Record<string, string> = { p: 'b', t: 'd', k: 'g' }; // ç is folded to c: not told apart from c

function trStem(w: string): string {
  return w.length > 5 && (w.endsWith('mak') || w.endsWith('mek')) ? w.slice(0, -3) : w;
}

function trPrefixMatch(longer: string, base: string): boolean {
  if (base.length < 2 || !longer.startsWith(base)) return false;
  return TR_SUFFIX.test(longer.slice(base.length));
}

function trSame(a: string, b: string): boolean {
  if (a === b) return true;
  const bases = (w: string) => {
    const s = trStem(w);
    const last = s[s.length - 1];
    // kitap -> kitab (before a vowel suffix), kitabı
    return last && SOFTEN[last] ? [s, s.slice(0, -1) + SOFTEN[last]] : [s];
  };
  for (const x of bases(a)) {
    if (x === trStem(b)) return true;
    if (trPrefixMatch(b, x)) return true;
  }
  for (const y of bases(b)) {
    if (y === trStem(a)) return true;
    if (trPrefixMatch(a, y)) return true;
  }
  return false;
}

const TR: LangKit = {
  generic: new Set([
    'bitirdim', 'tamamladim', 'yaptim', 'ettim', 'hallettim', 'tamam', 'bitti', 'tamamlandi',
    'isaretle', 'isaretledim', 'bitir', 'tamamla', 'yaptik', 'bitirdik', 'tamamladik',
  ]),
  stop: new Set(['ben', 'bugun', 'az', 'once', 'simdi', 've', 'da', 'de', 'bir', 'artik', 'zaten', 'hemen']),
  nounPrefixes: ['gorev', 'aliskanlik'],
  postponePrefixes: ['ertel', 'kaydir'],
  tomorrowPrefixes: ['yarin'],
  addPrefixes: ['ekle'],
  goalPrefixes: ['hedef'],
  isDoneWord: (w) => TR.generic.has(w) || (w.length >= 5 && /[dt][iu][mk]$/.test(w)),
  same: trSame,
};

// — English —
const EN_IRREGULAR: Record<string, string> = {
  drank: 'drink', ate: 'eat', ran: 'run', took: 'take', wrote: 'write', went: 'go', slept: 'sleep',
  swam: 'swim', did: 'do', made: 'make', got: 'get', had: 'have', read: 'read', cooked: 'cook',
  brought: 'bring', bought: 'buy', paid: 'pay', called: 'call', sent: 'send', cleaned: 'clean',
  done: 'do', woke: 'wake', cycled: 'cycle', biked: 'bike',
};

function enStem(w: string): string {
  const irregular = EN_IRREGULAR[w];
  let s = irregular ?? w;
  let stripped = false;
  for (const suf of irregular ? [] : ['ing', 'ed', 'es', 's']) {
    if (s.length > suf.length + 2 && s.endsWith(suf)) {
      s = s.slice(0, -suf.length);
      stripped = true;
      break;
    }
  }
  if (s.endsWith('e') && s.length > 3) s = s.slice(0, -1);
  if (s.endsWith('y')) s = s.slice(0, -1) + 'i';
  // doubled consonant before -ed/-ing: "stopped" -> "stop" (but "call" stays)
  if (stripped && /([^aeiou])\1$/.test(s) && s.length > 3) s = s.slice(0, -1);
  return s;
}

const EN: LangKit = {
  generic: new Set(['done', 'finished', 'completed', 'did', 'complete', 'finish', 'checked', 'ticked']),
  stop: new Set([
    'i', 'ive', 'im', 'just', 'today', 'my', 'the', 'a', 'an', 'already', 'have', 'has', 'now',
    'it', 'that', 'this', 'to', 'of', 'some', 'for', 'with', 'and',
  ]),
  nounPrefixes: ['task', 'todo', 'habit'],
  postponePrefixes: ['postpone', 'reschedul', 'delay', 'push', 'move', 'defer'],
  tomorrowPrefixes: ['tomorrow'],
  addPrefixes: ['add'],
  goalPrefixes: ['goal'],
  isDoneWord: (w) =>
    EN.generic.has(w) || (w.length >= 4 && w.endsWith('ed')) || Object.prototype.hasOwnProperty.call(EN_IRREGULAR, w),
  same: (a, b) => a === b || enStem(a) === enStem(b),
};

// — German —
const DE_IRREGULAR: Record<string, string> = {
  getrunken: 'trink', gelesen: 'les', gegessen: 'ess', gelaufen: 'lauf', gerannt: 'renn',
  geschlafen: 'schlaf', geschrieben: 'schreib', gegangen: 'geh', geschwommen: 'schwimm',
  gemacht: 'mach', gelernt: 'lern', gekocht: 'koch', gespielt: 'spiel', getan: 'tu',
};

function deStem(w: string): string {
  const irregular = DE_IRREGULAR[w];
  if (irregular) return irregular;
  let s = w;
  if (/^ge.{3,}(?:t|en)$/.test(s)) s = s.replace(/^ge/, '').replace(/(?:t|en)$/, '');
  else if (s.length > 4 && s.endsWith('en')) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith('e')) s = s.slice(0, -1);
  // "trinken" -> "trink" must meet "getrunken" -> irregular "trink"; infinitive stems already do.
  return s;
}

const DE: LangKit = {
  generic: new Set(['erledigt', 'fertig', 'geschafft', 'gemacht', 'abgehakt', 'abgeschlossen']),
  stop: new Set([
    'ich', 'habe', 'hab', 'heute', 'gerade', 'eben', 'schon', 'die', 'der', 'das', 'den', 'dem',
    'meine', 'mein', 'meinen', 'zum', 'zur', 'zu', 'und', 'auch', 'jetzt', 'es', 'ist', 'bin', 'nun',
  ]),
  nounPrefixes: ['aufgabe', 'gewohnheit'],
  postponePrefixes: ['verschieb', 'aufschieb', 'verleg'],
  tomorrowPrefixes: ['morgen'],
  addPrefixes: ['hinzu', 'addier'],
  goalPrefixes: ['ziel'],
  isDoneWord: (w) => DE.generic.has(w) || /^ge.{3,}(?:t|en)$/.test(w) || Object.prototype.hasOwnProperty.call(DE_IRREGULAR, w),
  same: (a, b) => a === b || deStem(a) === deStem(b),
};

const KITS: Record<Lang, LangKit> = { tr: TR, en: EN, de: DE };

// — Words of one sentence —
interface Heard {
  words: string[]; // folded
  amount: number | null;
  content: number[]; // indexes of words that identify an item
  units: Set<number>; // words right after a number ("2 bardak"): counted only when they match
  done: boolean;
  postpone: boolean; // a postpone word AND "tomorrow" were both said
  add: boolean; // an "add" word AND a number were both said
}

function listen(text: string, lang: Lang): Heard {
  const kit = KITS[lang];
  const words = tokenize(text, lang).map((t) => fold(t.raw, lang));
  let amount: number | null = null;
  const content: number[] = [];
  const units = new Set<number>();
  const used = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    const n = numberAt(words, i, lang);
    // "bir"/"ein" alone is a filler; as a count it needs a word after it.
    if (n && amount === null && !(n[0] === 1 && !words[i + n[1]])) {
      amount = n[0];
      for (let k = 0; k < n[1]; k++) used.add(i + k);
      if (words[i + n[1]]) units.add(i + n[1]);
      i += n[1] - 1;
    }
  }
  let done = false;
  const isPost = (w: string) => kit.postponePrefixes.some((p) => w.startsWith(p));
  const isTomorrow = (w: string) => kit.tomorrowPrefixes.some((p) => w.startsWith(p));
  const postpone = words.some(isPost) && words.some(isTomorrow);
  const isAdd = (w: string) => kit.addPrefixes.some((p) => w.startsWith(p));
  const isGoalWord = (w: string) => kit.goalPrefixes.some((p) => w.startsWith(p));
  const add = amount !== null && words.some(isAdd);
  words.forEach((w, i) => {
    if (kit.isDoneWord(w)) done = true;
    if (used.has(i) || kit.stop.has(w) || kit.generic.has(w)) return;
    if (kit.nounPrefixes.some((p) => w.startsWith(p))) return;
    // These words only stop being content when they form a postpone command.
    if (postpone && (isPost(w) || isTomorrow(w))) return;
    if (add && (isAdd(w) || isGoalWord(w))) return;
    content.push(i);
  });
  return { words, amount, content, units, done, postpone, add };
}

// Share of the spoken content words that some word of the title matches.
function coverage(heard: Heard, title: string, lang: Lang): number {
  const kit = KITS[lang];
  const titleWords = tokenize(title, lang)
    .map((t) => fold(t.raw, lang))
    .filter((w) => w && !kit.stop.has(w));
  if (titleWords.length === 0) return 0;
  let matched = 0;
  let counted = 0;
  for (const i of heard.content) {
    const w = heard.words[i];
    const hit = titleWords.some((tw) => kit.same(w, tw));
    if (hit) matched++;
    // A unit word that isn't in the title ("2 bardak su") doesn't count against.
    // Neither does the done-verb when the title is one bare noun ("Su", "Yoga"):
    // "su içtim" has to work for a habit called just "Su". A longer title carries
    // its own verb ("Kitap oku"), so a different verb ("kitap sattım") must not match.
    const forgiven = heard.units.has(i) || (titleWords.length === 1 && kit.isDoneWord(w));
    if (hit || !forgiven) counted++;
  }
  return matched === 0 || counted === 0 ? 0 : matched / counted;
}

export function parseVoiceCommand(text: string, lang: Lang, items: CommandItems): VoiceCommand {
  const heard = listen(text, lang);
  if (heard.content.length === 0) return { kind: 'none' };
  // "X'i yarına ertele" concerns a task only; a habit can't be moved to another day.
  if (heard.postpone) {
    return pick(items.tasks.map((task) => ({ score: coverage(heard, task.title, lang), target: { kind: 'postpone', task } })));
  }
  // "hedefime 5 km ekle": a number to add to one of the goals; when no goal fits
  // the sentence may still be a habit ("2 bardak su ekledim"), so fall through.
  if (heard.add && items.goals?.length && heard.amount) {
    const amount = heard.amount;
    const cmd = pick(items.goals.map((goal) => ({ score: coverage(heard, goal.title, lang), target: { kind: 'goal', goal, amount } })));
    if (cmd.kind !== 'none') return cmd;
  }
  if (!heard.done) return { kind: 'none' };

  const scored: { score: number; target: Target }[] = [];
  for (const habit of items.habits) {
    if (habit.kind === 'timer') continue; // a timer is run, not told
    const score = coverage(heard, habit.title, lang);
    if (score >= MIN_COVERAGE) {
      const amount = habit.kind === 'numeric' ? heard.amount && heard.amount > 0 ? heard.amount : 1 : 1;
      scored.push({ score, target: { kind: 'habit', habit, amount } });
    }
  }
  for (const task of items.tasks) {
    const score = coverage(heard, task.title, lang);
    if (score >= MIN_COVERAGE) scored.push({ score, target: { kind: 'task', task } });
  }
  return pick(scored);
}

// The best-matching targets as a command: none, one, or a short list to choose from.
function pick(all: { score: number; target: Target }[]): VoiceCommand {
  const scored = all.filter((s) => s.score >= MIN_COVERAGE);
  if (scored.length === 0) return { kind: 'none' };

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].score;
  const close = scored.filter((s) => best - s.score <= TIE_MARGIN).slice(0, MAX_OPTIONS);
  if (close.length === 1) return { kind: 'one', target: close[0].target };
  return { kind: 'choose', options: close.map((s) => s.target) };
}
