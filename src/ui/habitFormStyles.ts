// HabitForm's style factory — SPLIT OUT of src/ui/HabitForm.tsx (review
// finding H1: the component was 980 lines, with styles alone taking ~210 of them).
//
// PATTERN (see ThemeProvider): NO module-level StyleSheet.create — the factory
// is called at render time so it can be regenerated when the theme changes.

import { StyleSheet } from 'react-native';
import type { Colors } from '@/ui/theme';

export type HabitFormStyles = ReturnType<typeof makeHabitFormStyles>;

export const makeHabitFormStyles = (c: Colors) =>
  StyleSheet.create({
    // Section header — during editing (stepped=false), all field groups follow
    // one another in a single scroll, so this shows where each group ends/starts
    // (Identity/Frequency/Target/Reminder). In the wizard (stepped), a single
    // header shows per step — clarifies that step's context, does no harm.
    sectionHeader: {
      fontSize: 16,
      fontWeight: '800',
      color: c.text,
      marginTop: 22,
      marginBottom: 12,
      paddingTop: 18,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: c.muted,
      marginBottom: 8,
      marginTop: 4,
    },
    counter: { fontSize: 11, color: c.faint, textAlign: 'right', marginTop: -8, marginBottom: 12 },
    input: {
      backgroundColor: c.inputBg,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 12,
    },
    row: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
    iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    iconCell: {
      width: 42,
      height: 42,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.inputBg,
      borderWidth: 1,
      borderColor: c.border,
    },
    colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
    swatch: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchSel: { borderWidth: 3, borderColor: c.text },
    swatchCheck: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
    freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    // The "Every how many days? / How many times a week?" row (interval + quota modes).
    freqNumRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    freqNumLabel: { fontSize: 14, fontWeight: '600', color: c.text },
    freqNumInput: {
      width: 64,
      textAlign: 'center',
      backgroundColor: c.inputBg,
      borderRadius: 10,
      paddingVertical: 8,
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
    },
    freqNumHint: { flex: 1, fontSize: 12, color: c.faint },
    // Chips wrap TWO PER ROW (flexBasis ~half a row + flexGrow fills out the row).
    // Used to be `flex: 1`: the 4 frequency chips crammed into one row at ¼
    // width each, and "X times a week" wrapped onto two lines, breaking the
    // row height. With two chips (contribution style), the look stays the
    // same — both on one row.
    freqBtn: {
      flexBasis: '47%',
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    freqBtnSel: { borderColor: c.primary, backgroundColor: c.primarySoft, borderWidth: 2 },
    freqBtnText: { fontSize: 14, fontWeight: '600', color: c.muted, textAlign: 'center' },
    freqBtnTextSel: { color: c.primary },
    dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
    dayChip: {
      width: 42,
      paddingVertical: 8,
      borderRadius: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    dayChipSel: { borderColor: c.primary, backgroundColor: c.primary },
    dayChipText: { fontSize: 13, fontWeight: '700', color: c.muted },
    dayChipTextSel: { color: c.onAccent },
    targetInput: { flex: 1, marginBottom: 0 },
    hint: { fontSize: 12, color: c.faint, marginTop: 4, marginBottom: 12 },
    goalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    goalChip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    goalChipSel: { borderColor: c.primary, backgroundColor: c.primary },
    goalChipText: { fontSize: 13, fontWeight: '600', color: c.muted },
    goalChipTextSel: { color: c.onAccent },
    dateBtn: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    dateBtnText: { fontSize: 15, color: c.text },
    clearBtn: { paddingVertical: 12, paddingHorizontal: 14 },
    clearBtnText: { fontSize: 14, color: c.muted, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
    saveBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 15,
      borderRadius: 14,
      backgroundColor: c.primary,
      shadowColor: c.primary,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    saveBtnText: { fontSize: 15, fontWeight: '700', color: c.onAccent },
    saveBtnDisabled: { opacity: 0.4 },

    // Wizard: the identity badge at the top (shown on steps other than identity).
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20,
    },
    previewCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    previewTitle: { fontSize: 15, fontWeight: '700', color: c.text, flex: 1 },

    // Wizard: bottom navigation (dot indicator + Back/Next).
    wizardNav: { marginTop: 20 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 16 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.border },
    dotActive: { backgroundColor: c.primary, width: 18 },
    navBtns: { flexDirection: 'row', gap: 12 },
    navBackBtn: {
      width: 50,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    navBackText: { fontSize: 20, fontWeight: '700', color: c.text },
    navNextBtn: { flex: 1 },

    // Wizard: tracking type selection cards (first step).
    kindCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.inputBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      marginBottom: 10,
    },
    kindCardSel: { borderColor: c.primary, backgroundColor: c.primarySoft, borderWidth: 2 },
    kindIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    kindIconWrapSel: { backgroundColor: c.primary },
    kindBody: { flex: 1 },
    kindTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    kindDesc: { fontSize: 13, color: c.muted, marginTop: 2 },
  });
