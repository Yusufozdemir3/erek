// Style factory for the habit STATS screen — SPLIT OUT of app/habit/[id].tsx
// (same rationale as goal/goalStyles.ts: the screen file was 750 lines, the
// styles alone were ~145 lines, and the chart subcomponents share the same dictionary).
//
// PATTERN (see ThemeProvider): NO module-level StyleSheet.create — the
// factory is called during render so it can be regenerated when the theme changes.

import { StyleSheet } from 'react-native';
import type { Colors } from '@/ui/theme';

// — MEASUREMENTS for the 'History' bar chart — used by both the styles and
// the drawing logic — how many buckets fit on screen AT ONCE. Column width is
// derived from this: it used to try to fit all buckets (13-14 bars side by
// side) and the chart got unreadably cramped (user feedback). The remaining
// buckets are NOT lost — they're reached by horizontal scrolling, and it
// rests at the most recent end on open.
export const HISTORY_VISIBLE_COLS = 7;
// Bar area measurements. The statsHistoryRow/Label styles are also derived
// from these so bar height can be computed here in PIXELS (not percent) —
// only then can we decide whether the value text fits inside the bar.
export const HISTORY_ROW_H = 190;
export const HISTORY_LABEL_H = 16;
export const HISTORY_LABEL_GAP = 6;
export const HISTORY_TRACK_H = HISTORY_ROW_H - HISTORY_LABEL_H - HISTORY_LABEL_GAP;
// The value text sits INSIDE the bar and is HORIZONTAL. It was rotated 90°
// at one point: with a 26px column, the number didn't fit the bar
// horizontally. With HISTORY_VISIBLE_COLS=7 raising the column to ~50px and
// the bar to ~33px ("18.3k" ≈ 22px), rotation was no longer needed —
// horizontal text is both more legible and fully solved the "text taller
// than the bar" problem from the vertical layout: the fit condition is no
// longer the text's LENGTH but a single line's height.
export const HISTORY_VALUE_LINE = 12; // height of the text line
export const HISTORY_VALUE_INSET = 4; // gap from the top of the bar when writing inside
// Below this bar height, the line doesn't fit inside, so the text moves ABOVE the bar.
export const HISTORY_VALUE_MIN_BAR = HISTORY_VALUE_LINE + HISTORY_VALUE_INSET * 2;

export type HabitStatsStyles = ReturnType<typeof makeHabitStatsStyles>;

export const makeHabitStatsStyles = (c: Colors) =>
  StyleSheet.create({
    backRow: { marginBottom: 12 },
    backText: { fontSize: 15, fontWeight: '700', color: c.primary },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

    statsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
    statCard: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 14,
      alignItems: 'center',
    },
    statValue: { fontSize: 18, fontWeight: '800', color: c.text },
    statLabel: { fontSize: 12, color: c.muted, marginTop: 4, textAlign: 'center' },

    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    cardLabel: { fontSize: 13, color: c.muted, fontWeight: '600' },
    cardValue: { fontSize: 20, fontWeight: '800', color: c.text, marginTop: 4 },

    // — Streak badges —
    // Only EARNED badges are shown as medals (the locked showcase was removed).
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    badge: {
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
      backgroundColor: c.primarySoft,
      borderColor: c.primary,
    },
    badgeEmoji: { fontSize: 24 },
    badgeLabel: { fontSize: 11, color: c.muted, marginTop: 2 },
    // — Next badge: emoji + name + days left, with a progress bar below —
    badgeNextRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    badgeNextEmoji: { fontSize: 16, opacity: 0.5 },
    badgeNextLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: c.text },
    badgeNextLeft: { fontSize: 12, fontWeight: '600', color: c.muted },
    badgeTrack: { height: 6, borderRadius: 3, backgroundColor: c.track, overflow: 'hidden', marginTop: 8 },
    badgeFill: { height: '100%', borderRadius: 3 },
    badgeAllEarned: { fontSize: 13, fontWeight: '700', color: c.text },

    // Missed day (monthly calendar): a red that reads in both themes. Not
    // scheduled: a faint gray that stands out from the background (not bg —
    // bg was the same as the background and stayed invisible).
    cellMissed: { backgroundColor: '#f87171' },
    cellUnscheduled: { backgroundColor: c.border },

    // — Day/Week/Month tabs (shared by Score + History) —
    periodBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    periodBtnSel: { borderColor: c.primary, backgroundColor: c.primarySoft },
    periodText: { fontSize: 12, fontWeight: '700', color: c.faint },
    periodTextSel: { color: c.primary },

    // — Month calendar —
    calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    calNavBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    calNavBtnDisabled: { opacity: 0.4 },
    calMonthLabel: { fontSize: 15, fontWeight: '700', color: c.text },
    calWeekHead: { flexDirection: 'row', marginTop: 14, marginBottom: 4 },
    calWeekHeadText: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: c.faint },
    calRow: { flexDirection: 'row' },
    calCell: { flex: 1, aspectRatio: 1, margin: 2, alignItems: 'center', justifyContent: 'center' },
    calCellFilled: { borderRadius: 8, backgroundColor: c.track },
    calDayText: { fontSize: 12, fontWeight: '600', color: c.muted },
    calDayTextOn: { color: c.onAccent, fontWeight: '800' },

    // — Goal/Score/History card — a LAYOUT/STRUCTURE port of the Claude
    // Design mockup (Round 9, card 9a). The COLORS, however, are not copied
    // as fixed values from the mockup — they come from the app's own theme
    // tokens (c.*); otherwise this section would stay the same dull black no
    // matter the light/dark theme, looking like an image pasted onto the
    // screen (user feedback: "looked like a photo"). In dark theme
    // (especially the "Pure Black" style, see theme.ts blackColors) it
    // already looks very close to the mockup — but now it's ACTUALLY coded,
    // not a frozen asset.
    statsCard: {
      backgroundColor: c.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    statsSection: { padding: 20 },
    statsSectionBordered: { borderTopWidth: 1, borderTopColor: c.border },
    statsEyebrow: { color: c.faint, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 14 },
    statsGoalHeadRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    statsGoalLabel: { color: c.muted, fontSize: 11, fontWeight: '600' },
    statsGoalValue: { color: c.text, fontSize: 11, fontWeight: '600' },
    statsGoalTrack: { height: 1, backgroundColor: c.border },
    statsGoalFill: { position: 'absolute', left: 0, top: -1, height: 3, backgroundColor: c.text, borderRadius: 1.5 },
    statsHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    statsPeriodRow: { flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 4 },
    statsPeriodBtn: { paddingHorizontal: 10, paddingVertical: 5 },
    statsTitle: { color: c.text, fontSize: 14, fontWeight: '700', letterSpacing: 1 },
    statsMeta: { color: c.faint, fontSize: 11, fontWeight: '600' },
    // SCALE: brought to the SAME proportion as the Score chart (ScoreLineChart)
    // — the old values (120px row, 8/7px text) weren't readable on a phone,
    // and once Score was enlarged the two cards looked unbalanced side by
    // side (user feedback). Measurements come from the HISTORY_* constants;
    // bar height is computed there in pixels.
    statsHistoryRow: { flexDirection: 'row', alignItems: 'flex-end', height: HISTORY_ROW_H, marginTop: 4 },
    statsHistoryCol: { height: '100%', alignItems: 'center' },
    // Width/position/color are supplied at draw time (depend on column and bar size).
    statsHistoryValue: {
      position: 'absolute',
      left: 0,
      height: HISTORY_VALUE_LINE,
      lineHeight: HISTORY_VALUE_LINE,
      fontSize: 9,
      fontWeight: '700',
      textAlign: 'center',
    },
    statsHistoryBarTrack: { flex: 1, width: '65%', justifyContent: 'flex-end' },
    statsHistoryBar: { width: '100%', borderRadius: 6, minHeight: 4 },
    statsHistoryLabel: {
      fontSize: 10,
      lineHeight: HISTORY_LABEL_H,
      fontWeight: '600',
      color: c.faint,
      marginTop: HISTORY_LABEL_GAP,
    },
  });
