// Color palettes (light/dark) and shared styles used across screens.
// The active palette comes from ThemeProvider (useTheme()); screens build their
// styles at render time with makeShared(colors) and their own makeStyles(colors).

import { StyleSheet } from 'react-native';
import type { Priority } from '@/db';
import type { Lang } from '@/i18n/translations';

// Re-exported for screens; imported too because `export … from` doesn't bind it here.
import { DATE_LOCALE } from '@/i18n/dateLocale';
export { DATE_LOCALE };

export interface Colors {
  bg: string;         // screen background
  card: string;       // card/panel background
  border: string;     // thin border
  line: string;       // a slightly more visible line (checkbox border, handle)
  text: string;       // primary text
  muted: string;      // secondary text
  faint: string;      // faintest text/placeholder
  primary: string;    // brand accent
  primarySoft: string;// the accent's faint background (chip/badge)
  done: string;       // completed (green)
  streak: string;     // streak (orange)
  danger: string;     // delete/error (red)
  track: string;      // progress bar/grid background
  inputBg: string;    // form input background
  onAccent: string;   // text on a colored button/mark
}

// text, muted and faint all carry real content (faint = placeholders, hints),
// so each clears WCAG AA (4.5:1) on the background — measured ratios below,
// enforced by __tests__/contrast.ui.test.tsx.
export const lightColors: Colors = {
  bg: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  line: '#cbd5e1',
  text: '#0f172a',   // ~17:1
  muted: '#4b5768',  // ~7.1:1
  faint: '#64748b',  // ~4.6:1
  primary: '#4f46e5',
  primarySoft: '#e0e7ff',
  done: '#10b981',
  streak: '#f97316',
  danger: '#dc2626',
  track: '#eef2f7',
  inputBg: '#f8fafc',
  onAccent: '#ffffff',
};

// Warm dark: a brown-leaning near-black whose text is the light theme's cream,
// so both modes share one warm identity with the accents.
export const darkColors: Colors = {
  bg: '#161412',
  card: '#211f1c',
  border: '#3a3632',
  line: '#4a453f',
  text: '#f4f1ea',
  muted: '#a8a29a',  // ~7.3:1
  faint: '#8d867c',  // ~5.1:1
  primary: '#818cf8',
  primarySoft: '#312e81',
  done: '#34d399',
  streak: '#fb923c',
  danger: '#f87171',
  track: '#3a3632',
  inputBg: '#1c1a17',
  onAccent: '#ffffff',
};

// Pure black (AMOLED) dark style with neutral grays — Appearance › dark theme style.
export const blackColors: Colors = {
  bg: '#000000',
  card: '#101010',
  border: '#262626',
  line: '#3a3a3a',
  text: '#f2f2f2',
  muted: '#9c9c9c',  // ~7.6:1
  // Measured on the lighter card (#101010), the harder case.
  faint: '#7d7d7d',  // ~4.6:1 on the card
  primary: '#818cf8',
  primarySoft: '#26264a',
  done: '#34d399',
  streak: '#fb923c',
  danger: '#f87171',
  track: '#1e1e1e',
  inputBg: '#0b0b0b',
  onAccent: '#ffffff',
};

// The accent (Appearance) overrides only primary/primarySoft; semantic and
// background/text colors stay with the theme.
export type AccentKey =
  | 'pine'
  | 'terracotta'
  | 'ink'
  | 'indigo'
  | 'wine'
  | 'mustard'
  | 'ocean'
  | 'plum'
  | 'rose'
  | 'slate';

interface AccentPalette {
  primary: string;
  primarySoft: string;
}

export const ACCENT_THEMES: Record<AccentKey, { light: AccentPalette; dark: AccentPalette }> = {
  pine: {
    light: { primary: '#2F5D45', primarySoft: '#DCE8DF' },
    dark: { primary: '#6FA98A', primarySoft: '#1E3B2C' },
  },
  terracotta: {
    light: { primary: '#C0532E', primarySoft: '#F5D9CC' },
    dark: { primary: '#E08A65', primarySoft: '#4A2418' },
  },
  ink: {
    light: { primary: '#1E3A5F', primarySoft: '#DAE3EE' },
    dark: { primary: '#7FA8D6', primarySoft: '#1C3450' },
  },
  indigo: {
    light: { primary: '#4f46e5', primarySoft: '#e0e7ff' },
    dark: { primary: '#818cf8', primarySoft: '#312e81' },
  },
  wine: {
    light: { primary: '#7A2E3A', primarySoft: '#F0D9DD' },
    dark: { primary: '#C97A88', primarySoft: '#3D1820' },
  },
  mustard: {
    light: { primary: '#96591A', primarySoft: '#F0DFC0' },
    dark: { primary: '#D9A24B', primarySoft: '#402E10' },
  },
  ocean: {
    light: { primary: '#0E7490', primarySoft: '#D3EAF0' },
    dark: { primary: '#5EC5D9', primarySoft: '#0F3A44' },
  },
  plum: {
    light: { primary: '#6D28D9', primarySoft: '#E6DCF7' },
    dark: { primary: '#B79AF0', primarySoft: '#2E1F55' },
  },
  rose: {
    light: { primary: '#BE185D', primarySoft: '#F7D9E6' },
    dark: { primary: '#E58AB3', primarySoft: '#4A1230' },
  },
  slate: {
    light: { primary: '#475569', primarySoft: '#E1E6EC' },
    dark: { primary: '#9FB0C3', primarySoft: '#26303C' },
  },
};

// Picker order; the first is the default.
export const ACCENT_ORDER: AccentKey[] = [
  'pine', 'terracotta', 'ink', 'indigo', 'wine', 'mustard',
  'ocean', 'plum', 'rose', 'slate',
];
export const DEFAULT_ACCENT: AccentKey = 'pine';

// Priority and habit colors are the same in both modes.
export const PRIORITY_COLOR: Record<Priority, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981',
};

export const PRIORITY_ORDER: Priority[] = ['low', 'medium', 'high'];

// Habit colors: mid-tones readable in both themes.
export const HABIT_COLORS = [
  '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6',
  '#f97316', '#84cc16', '#06b6d4', '#3b82f6',
  '#a855f7', '#e11d48', '#a16207', '#64748b',
];

export const DEFAULT_HABIT_COLOR = '#6366f1';

// "YYYY-MM-DD" (or ISO) -> "Jun 28"; noDateLabel for null (pass t('date.noDate')).
export function shortDate(value: string | null, lang: Lang = 'tr', noDateLabel = 'Tarihsiz'): string {
  if (!value) return noDateLabel;
  const ymd = value.slice(0, 10);
  return new Date(`${ymd}T00:00:00`).toLocaleDateString(DATE_LOCALE[lang], {
    day: 'numeric',
    month: 'short',
  });
}

// -> "June 28, 2026"
export function longDateLabel(value: string | null, lang: Lang = 'tr', noDateLabel = 'Tarihsiz'): string {
  if (!value) return noDateLabel;
  const ymd = value.slice(0, 10);
  return new Date(`${ymd}T00:00:00`).toLocaleDateString(DATE_LOCALE[lang], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ISO -> "Jul 15, 14:32", for "exactly when" (entry history, last sync).
export function dateTimeLabel(iso: string, lang: Lang = 'tr'): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(DATE_LOCALE[lang], { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(DATE_LOCALE[lang], { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

// -> "Monday, June 29, 2026"
export function fullDateLabel(ymd: string, lang: Lang = 'tr'): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString(DATE_LOCALE[lang], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Days left / overdue / due today; the translated pieces come from the caller.
export function deadlineLabel(
  ymd: string | null,
  labels: { daysLeft: (n: number) => string; dueToday: string; daysAgo: (n: number) => string }
): string {
  if (!ymd) return '';
  const target = new Date(`${ymd}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 86_400_000);
  if (diff > 0) return labels.daysLeft(diff);
  if (diff === 0) return labels.dueToday;
  return labels.daysAgo(-diff);
}

// "%53" (tr), "53%" (en), "53 %" (de, non-breaking space).
export function percentLabel(n: number, lang: Lang = 'tr'): string {
  if (lang === 'tr') return `%${n}`;
  if (lang === 'de') return `${n} %`;
  return `${n}%`;
}

// Switch colors visible in every theme: an OFF thumb in the card color
// vanished on its track (~1.3:1), so OFF uses faint (≥3.3:1).
export function switchColors(c: Colors, value: boolean) {
  return {
    trackColor: { false: c.border, true: c.primary },
    thumbColor: value ? c.card : c.faint,
  };
}

// Shared styles for a palette (useTheme().shared).
export function makeShared(c: Colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 48 },

    greeting: { fontSize: 34, fontWeight: '800', color: c.text },
    subtitle: { fontSize: 15, color: c.muted, marginTop: 2 },
    // Screen title + profile icon row on the right.
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 28, marginBottom: 12 },
    sectionTitle: { fontSize: 20, fontWeight: '700', color: c.text },
    badge: {
      marginLeft: 8,
      minWidth: 22,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '700',
      color: c.primary,
      backgroundColor: c.primarySoft,
      borderRadius: 11,
      paddingHorizontal: 6,
      paddingVertical: 1,
      overflow: 'hidden',
    },

    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.line,
      marginRight: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxDone: { backgroundColor: c.done, borderColor: c.done },
    checkmark: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
    cardBody: { flex: 1, paddingVertical: 4 },
    cardTitle: { flex: 1, fontSize: 15, color: c.text },
    cardTitleDone: { color: c.faint, textDecorationLine: 'line-through' },
    streak: { fontSize: 14, fontWeight: '700', color: c.streak },

    empty: { fontSize: 14, color: c.faint, paddingVertical: 8 },
  });
}
