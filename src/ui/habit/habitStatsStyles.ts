// Styles of the habit stats screen and its chart components, built per render
// from the theme (no module-level StyleSheet).

import { StyleSheet } from 'react-native';
import type { Colors } from '@/ui/theme';

// Missed calendar days: a soft danger tint, not a red wall (contrast-tested).
export const MISSED_TINT_ALPHA = '33'; // ≈ 20 %

// — History bar chart sizes (styles and drawing) — bars visible at once; the
// rest scroll, opening at the newest.
export const HISTORY_VISIBLE_COLS = 7;
// In pixels, so the drawing can tell whether the value fits inside a bar.
export const HISTORY_ROW_H = 190;
export const HISTORY_LABEL_H = 16;
export const HISTORY_LABEL_GAP = 6;
export const HISTORY_TRACK_H = HISTORY_ROW_H - HISTORY_LABEL_H - HISTORY_LABEL_GAP;
// The value is written horizontally inside the bar (~50px columns fit "18.3k").
export const HISTORY_VALUE_LINE = 12;
export const HISTORY_VALUE_INSET = 4; // from the bar's top
// Shorter bars get the value above them.
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
    statValue: { fontSize: 22, fontWeight: '800', color: c.text },
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

    // — Earned streak badges —
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

    // Missed: the danger tint, normal text. Unscheduled: border gray (bg would vanish).
    cellMissed: { backgroundColor: c.danger + MISSED_TINT_ALPHA },
    calDayTextMissed: { color: c.text, fontWeight: '800' },
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

    // — Goal/Score/History cards, colored from the theme tokens —
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
    // Same proportions as the score chart; sizes from HISTORY_*.
    statsHistoryRow: { flexDirection: 'row', alignItems: 'flex-end', height: HISTORY_ROW_H, marginTop: 4 },
    statsHistoryCol: { height: '100%', alignItems: 'center' },
    // Width/position/color are set while drawing.
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
