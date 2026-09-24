// Style factory for the goal DETAIL screen — SPLIT OUT of app/goal/[id].tsx.
// Rationale: the screen file had grown to 1080 lines and the styles alone
// were ~240 lines; the tab components also share the same styles. Keeping
// the style dictionary separate both keeps the screen readable and lets the
// tabs' shared `styles` prop be typed from a single place.
//
// PATTERN (see ThemeProvider): NO module-level StyleSheet.create — the
// `makeGoalStyles(colors)` factory is called during render so it can be
// regenerated when the theme changes.

import { StyleSheet } from 'react-native';
import type { Colors } from '@/ui/theme';

export type GoalStyles = ReturnType<typeof makeGoalStyles>;

export const makeGoalStyles = (c: Colors) =>
  StyleSheet.create({
    backRow: { marginBottom: 12 },
    backText: { fontSize: 15, fontWeight: '700', color: c.primary },

    tabBar: { flexDirection: 'row', gap: 6, marginTop: 20, marginBottom: 20 },
    tabBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingVertical: 9,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    tabBtnActive: { borderColor: c.primary, backgroundColor: c.primarySoft },
    tabLabel: { fontSize: 11, fontWeight: '700', color: c.faint },
    tabLabelActive: { color: c.primary },

    completedBanner: {
      backgroundColor: c.primarySoft,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 16,
    },
    completedBannerText: { fontSize: 15, fontWeight: '700', color: c.primary },

    progressTrack: {
      height: 10,
      borderRadius: 5,
      backgroundColor: c.track,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 5, backgroundColor: c.primary },
    overviewLine: { fontSize: 15, fontWeight: '700', color: c.text, marginTop: 10 },
    deadlineLine: { fontSize: 13, color: c.streak, fontWeight: '700', marginTop: 6 },

    // — General tab: data entry —
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      gap: 10,
    },
    // Free-form amount entry: the user types a value and taps "Add" (numeric goal).
    entryInputRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
    entryInput: {
      flex: 1,
      backgroundColor: c.inputBg,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 14,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
    },
    entryAddBtn: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: c.primary,
    },
    entryAddText: { fontSize: 14, fontWeight: '700', color: c.onAccent },

    // — Entry history —
    entryHistory: { marginTop: 20 },
    entryHistoryTitle: { fontSize: 13, fontWeight: '700', color: c.muted, marginBottom: 8 },
    entryHistoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 7,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    entryHistoryAmount: { fontSize: 14, fontWeight: '700', color: c.primary },
    entryHistoryAmountNeg: { color: c.danger },
    entryHistoryDate: { fontSize: 12, color: c.faint },

    completeToggleBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.primary,
      backgroundColor: c.card,
    },
    completeToggleBtnDone: { backgroundColor: c.done, borderColor: c.done },
    completeToggleText: { fontSize: 13, fontWeight: '700', color: c.primary },
    completeToggleTextDone: { color: c.onAccent },

    sectionTitle: { marginTop: 24, marginBottom: 12 },

    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },

    habitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
    habitRowDivider: { borderTopWidth: 1, borderTopColor: c.border },
    habitDot: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    habitTitle: { flex: 1, fontSize: 14, color: c.text, fontWeight: '600' },
    habitChevron: { fontSize: 18, color: c.faint },

    // — Stats: verdict banner + group headings —
    verdict: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      padding: 16,
      marginBottom: 18,
    },
    verdictGood: { borderColor: c.done, backgroundColor: c.done + '18' },
    verdictBad: { borderColor: c.danger, backgroundColor: c.danger + '18' },
    verdictText: { fontSize: 16, fontWeight: '800', color: c.text, lineHeight: 22 },
    verdictTextGood: { color: c.done },
    verdictTextBad: { color: c.danger },
    verdictSub: { fontSize: 13, color: c.muted, fontWeight: '600', marginTop: 6 },
    groupTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.muted,
      marginTop: 22,
      marginBottom: 10,
    },

    // — Stat cards (grid) —
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statCard: {
      flexGrow: 1,
      flexBasis: '30%',
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 14,
      alignItems: 'center',
    },
    statValue: { fontSize: 18, fontWeight: '800', color: c.text },
    statValueDanger: { color: c.danger },
    statValuePrimary: { color: c.primary },
    statLabel: { fontSize: 11, color: c.muted, marginTop: 4, textAlign: 'center' },
    paceHint: { fontSize: 12, color: c.faint, marginTop: 4, width: '100%' },
    // Title of the next milestone — sits ABOVE the cards, says which threshold
    // is being viewed (the cards only show numbers, this line provides the context).
    nextMilestoneTitle: { fontSize: 14, fontWeight: '700', color: c.text, width: '100%', marginBottom: 6 },

    // — Milestones (checklist + intermediate-threshold bars) —
    milestoneRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
    milestoneTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    milestonePct: { fontSize: 13, fontWeight: '800', color: c.primary },
    milestonePctDone: { color: c.done },
    milestoneBarTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: c.track,
      overflow: 'hidden',
      marginTop: 6,
    },
    milestoneBarFill: { height: '100%', borderRadius: 4, backgroundColor: c.primary },
    milestoneMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    milestoneMeta: { fontSize: 11, color: c.faint, fontWeight: '600' },
    milestoneMetaOverdue: { color: c.danger },
    // — Staged chips below the add row (amount / date) —
    milestoneChipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    milestoneChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    milestoneChipSet: { borderColor: c.primary, backgroundColor: c.primarySoft },
    milestoneChipText: { fontSize: 12, fontWeight: '700', color: c.muted },
    milestoneChipTextSet: { color: c.primary },
    milestoneAmountInput: {
      width: 96,
      textAlign: 'center',
      backgroundColor: c.inputBg,
      borderRadius: 999,
      paddingVertical: 7,
      fontSize: 13,
      color: c.text,
      borderWidth: 1,
      borderColor: c.primary,
    },
    milestoneHint: { fontSize: 11, color: c.faint, marginTop: 10, lineHeight: 15 },
    milestoneBox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    milestoneBoxDone: { backgroundColor: c.done, borderColor: c.done },
    milestoneCheck: { color: c.onAccent, fontSize: 12, fontWeight: '800' },
    milestoneTitle: { flex: 1, fontSize: 14, color: c.text },
    milestoneTitleDone: { color: c.faint, textDecorationLine: 'line-through' },
    milestoneDelete: { fontSize: 20, color: c.faint, paddingHorizontal: 4 },
    milestoneAddRow: { flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' },
    milestoneInput: {
      flex: 1,
      backgroundColor: c.inputBg,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
    },
    milestoneAddBtn: {
      width: 44,
      alignSelf: 'stretch',
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    milestoneAddText: { fontSize: 20, color: c.primary, fontWeight: '600' },
  });
