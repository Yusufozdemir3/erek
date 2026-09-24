// Color palettes (light/dark) and shared styles used across screens.
// Dark mode: colors are no longer static — the active palette is obtained from
// ThemeProvider via useTheme(). Screens/components generate their styles at
// render time with makeShared(colors) and their own makeStyles(colors) factories.
// Backward compat: `colors` and `shared` are exported with the light palette (if
// a spot hasn't been migrated yet, it just appears light — the build doesn't break).

import { StyleSheet } from 'react-native';
import type { Priority } from '@/db';
import type { Lang } from '@/i18n/translations';

// The Intl/Date locale matching the active language (for month/day names).
// Backward compat: DATE_LOCALE now lives in i18n/dateLocale.ts (plain data, no
// RN dependency) — re-exported from here so existing imports don't break. NOTE:
// `export ... from` doesn't bring the name into THIS module's scope, so it's also imported separately.
import { DATE_LOCALE } from '@/i18n/dateLocale';
export { DATE_LOCALE };

// All color tokens for a single theme.
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
  onAccent: string;   // text ON TOP of a colored button/mark (light in both modes)
}

// — CONTRAST OF TEXT TONES —
// text/muted/faint all carry REAL content: faint isn't just decoration, it's
// form placeholders, hint lines, and footnotes. So all three must clear the
// WCAG AA body-text threshold (4.5:1) against the background.
// In the previous palette, faint was 2.5:1 in light, 3.9:1 in warm dark, 4.1:1 in
// black — i.e. unreadable in sunlight or with age-related vision loss. faint was
// darkened enough to clear the threshold; muted was shifted along with it (in
// the light theme) so the hierarchy between the three levels isn't lost. Measured
// ratios are in the comments; __tests__/contrast.ui.test.tsx verifies them so this
// doesn't silently regress again.
export const lightColors: Colors = {
  bg: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  line: '#cbd5e1',
  text: '#0f172a',   // ~17:1
  muted: '#4b5768',  // ~7.1:1 (old #64748b shifted to faint)
  faint: '#64748b',  // ~4.6:1 (old #94a3b8 → 2.5:1, was below AA)
  primary: '#4f46e5',
  primarySoft: '#e0e7ff',
  done: '#10b981',
  streak: '#f97316',
  danger: '#dc2626',
  track: '#eef2f7',
  inputBg: '#f8fafc',
  onAccent: '#ffffff',
};

// Warm ink: a near-black background leaning toward brown (instead of a cool
// slate/navy) — sits in the same family as the cream background in light mode
// (#F4F1EA), and the text color is identical to that cream. This makes both
// modes feel like part of the same editorial identity (see the accent colors:
// pine/terracotta/ink/wine/mustard are also warm tones).
export const darkColors: Colors = {
  bg: '#161412',
  card: '#211f1c',
  border: '#3a3632',
  line: '#4a453f',
  text: '#f4f1ea',
  muted: '#a8a29a',  // ~7.3:1
  faint: '#8d867c',  // ~5.1:1 (old #78726a → 3.9:1, was below AA)
  primary: '#818cf8',
  primarySoft: '#312e81',
  done: '#34d399',
  streak: '#fb923c',
  danger: '#f87171',
  track: '#3a3632',
  inputBg: '#1c1a17',
  onAccent: '#ffffff',
};

// FULL BLACK (AMOLED) dark style: pure black background + neutral dark grays.
// Turns off pixels on OLED screens (battery + contrast). Unlike warm dark, there's
// no brown tint — the user picks it from Profile > Appearance via "Dark theme
// style" (see ThemeProvider.darkStyle). The accent still comes from ACCENT_THEMES' dark palette.
export const blackColors: Colors = {
  bg: '#000000',
  card: '#101010',
  border: '#262626',
  line: '#3a3a3a',
  text: '#f2f2f2',
  muted: '#9c9c9c',  // ~7.6:1
  // Since the card background (#101010) is lighter than pure black, the
  // measurement is done AGAINST IT: #7a7a7a gives 5.1:1 on pure black but drops
  // to 4.43 on the card.
  faint: '#7d7d7d',  // ~4.6:1 on the card (old #6e6e6e → 4.1:1, was below AA)
  primary: '#818cf8',
  primarySoft: '#26264a',
  done: '#34d399',
  streak: '#fb923c',
  danger: '#f87171',
  track: '#1e1e1e',
  inputBg: '#0b0b0b',
  onAccent: '#ffffff',
};

// Backward-compatible default (light). Migrated components use useTheme().colors.
export const colors: Colors = lightColors;

// Accent color (brand color) — chosen by the user in Profile, stored in
// AsyncStorage (see ThemeProvider). Only overrides primary/primarySoft;
// semantic colors like done/danger/streak and the background/text tones keep
// coming from the theme (light/dark) — the accent color only carries "brand" meaning.
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

// Selector order on the Profile screen; the first element is the default accent color.
export const ACCENT_ORDER: AccentKey[] = [
  'pine', 'terracotta', 'ink', 'indigo', 'wine', 'mustard',
  'ocean', 'plum', 'rose', 'slate',
];
export const DEFAULT_ACCENT: AccentKey = 'pine';

// Priority and habit colors are the same in both modes (vivid accents; readable in dark too).
export const PRIORITY_COLOR: Record<Priority, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981',
};

// Order in the priority picker (low to high).
export const PRIORITY_ORDER: Priority[] = ['low', 'medium', 'high'];

// Habit color palette (for the icon set, see src/ui/habitIcons.tsx — this used
// to hold a raw emoji list, since replaced with a line-vector icon set).
// 16 colors — all vivid mid-tones readable in both themes.
export const HABIT_COLORS = [
  '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6',
  '#f97316', '#84cc16', '#06b6d4', '#3b82f6',
  '#a855f7', '#e11d48', '#a16207', '#64748b',
];

// Default used when a habit has no color.
export const DEFAULT_HABIT_COLOR = '#6366f1';

// "YYYY-MM-DD" (or ISO) -> a short label like "Jun 28". lang determines which
// locale (month names, etc.) is used to format it; noDateLabel is the translated
// text shown when there's no value (the caller passes t('date.noDate')).
export function shortDate(value: string | null, lang: Lang = 'tr', noDateLabel = 'Tarihsiz'): string {
  if (!value) return noDateLabel;
  const ymd = value.slice(0, 10);
  return new Date(`${ymd}T00:00:00`).toLocaleDateString(DATE_LOCALE[lang], {
    day: 'numeric',
    month: 'short',
  });
}

// "YYYY-MM-DD" (or ISO) -> a long label like "June 28, 2026".
export function longDateLabel(value: string | null, lang: Lang = 'tr', noDateLabel = 'Tarihsiz'): string {
  if (!value) return noDateLabel;
  const ymd = value.slice(0, 10);
  return new Date(`${ymd}T00:00:00`).toLocaleDateString(DATE_LOCALE[lang], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ISO timestamp -> "Jul 15, 14:32" (date + time). What sets it apart from other
// date labels is that it also shows the TIME: for places answering "exactly when
// did this happen" (goal entry history, last sync timestamp).
// A relative format ("3 days ago") was deliberately NOT CHOSEN: it requires
// pluralization rules, which t() doesn't currently support (would produce "1 days ago" in English).
export function dateTimeLabel(iso: string, lang: Lang = 'tr'): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(DATE_LOCALE[lang], { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(DATE_LOCALE[lang], { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

// "YYYY-MM-DD" -> a full label with weekday name (like "Monday, June 29, 2026").
export function fullDateLabel(ymd: string, lang: Lang = 'tr'): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString(DATE_LOCALE[lang], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Produces the remaining-days label for a dated goal/task. The translated pieces
// (how many days left/passed, "due today") come from the caller (t()).
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

// Generates shared styles for the active palette. Components: const { shared } = useTheme().
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

// Backward-compatible default shared styles (light). Migrated screens use useTheme().shared.
export const shared = makeShared(lightColors);
