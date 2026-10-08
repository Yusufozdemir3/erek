// The task form's repeat picker: one equal-height radio row per mode, and the
// selected mode's own setting (days, every N days, day of month, dates)
// right under it. The form itself shows only a one-line summary.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { toYmd } from '@/lib/helpers';
import { useI18n } from '@/i18n/I18nProvider';
import { DatePickerModal } from '@/ui/DatePickerModal';
import { SHORT_NUMBER_MAX_LEN } from '@/ui/formLimits';
import { ModalCard } from '@/ui/ModalCard';
import { useTheme } from '@/ui/ThemeProvider';
import { shortDate, type Colors } from '@/ui/theme';

// 'none' = one-time.
export type RepeatMode = 'none' | 'daily' | 'weekly' | 'interval' | 'monthly' | 'yearly';

export const REPEAT_OPTIONS: { mode: RepeatMode; labelKey: string }[] = [
  { mode: 'none', labelKey: 'task.repeatNone' },
  { mode: 'daily', labelKey: 'habit.everyDay' },
  { mode: 'weekly', labelKey: 'habit.specificDays' },
  { mode: 'interval', labelKey: 'task.repeatInterval' },
  { mode: 'monthly', labelKey: 'task.freqMonthly' },
  { mode: 'yearly', labelKey: 'task.freqYearly' },
];

// Monday to Sunday (wd = JS getDay).
const WEEKDAY_OPTIONS = [
  { labelKey: 'weekday.mon', wd: 1 },
  { labelKey: 'weekday.tue', wd: 2 },
  { labelKey: 'weekday.wed', wd: 3 },
  { labelKey: 'weekday.thu', wd: 4 },
  { labelKey: 'weekday.fri', wd: 5 },
  { labelKey: 'weekday.sat', wd: 6 },
  { labelKey: 'weekday.sun', wd: 0 },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  mode: RepeatMode;
  onMode: (mode: RepeatMode) => void;
  weekdays: number[];
  onToggleWeekday: (wd: number) => void;
  everyN: string;
  onEveryN: (v: string) => void;
  monthDay: string;
  onMonthDay: (v: string) => void;
  yearDates: string[]; // "MM-DD"
  onYearDates: (dates: string[]) => void;
  dueDate: string; // "YYYY-MM-DD", the year-date picker starts there
}

export function RepeatSheet(p: Props) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  const [showYearPicker, setShowYearPicker] = useState(false);

  const settings = (mode: RepeatMode) => {
    if (mode === 'weekly') {
      return (
        <View style={styles.weekRow}>
          {WEEKDAY_OPTIONS.map(({ labelKey, wd }) => {
            const sel = p.weekdays.includes(wd);
            return (
              <Pressable
                key={wd}
                style={[styles.day, sel && styles.daySel]}
                onPress={() => p.onToggleWeekday(wd)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: sel }}
                accessibilityLabel={t(labelKey)}
              >
                <Text style={[styles.dayText, sel && styles.dayTextSel]}>{t(labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>
      );
    }
    if (mode === 'interval' || mode === 'monthly') {
      const interval = mode === 'interval';
      return (
        <View style={styles.numRow}>
          <Text style={styles.numLabel}>{t(interval ? 'habit.everyNPrompt' : 'task.monthDayPrompt')}</Text>
          <TextInput
            style={styles.numInput}
            value={interval ? p.everyN : p.monthDay}
            onChangeText={interval ? p.onEveryN : p.onMonthDay}
            keyboardType="number-pad"
            maxLength={interval ? SHORT_NUMBER_MAX_LEN : 2}
            accessibilityLabel={t(interval ? 'habit.everyNPrompt' : 'task.monthDayPrompt')}
          />
          <Text style={styles.numHint}>{t(interval ? 'habit.everyNHint' : 'task.monthDayHint')}</Text>
        </View>
      );
    }
    if (mode === 'yearly') {
      return (
        <View style={styles.dateRow}>
          {p.yearDates.map((md) => (
            <Pressable
              key={md}
              style={[styles.dateChip, styles.daySel]}
              onPress={() => p.onYearDates(p.yearDates.filter((x) => x !== md))}
              accessibilityLabel={t('task.removeDateA11y', { date: shortDate(`2000-${md}`, lang) })}
            >
              <Text style={[styles.dayText, styles.dayTextSel]}>{shortDate(`2000-${md}`, lang)} ×</Text>
            </Pressable>
          ))}
          <Pressable style={styles.dateChip} onPress={() => setShowYearPicker(true)} accessibilityRole="button">
            <Text style={styles.dayText}>{t('task.addDate')}</Text>
          </Pressable>
          <DatePickerModal
            visible={showYearPicker}
            value={new Date(`${p.dueDate}T00:00:00`)}
            onClose={() => setShowYearPicker(false)}
            onConfirm={(picked) => {
              const md = toYmd(picked).slice(5, 10); // no year
              if (!p.yearDates.includes(md)) p.onYearDates([...p.yearDates, md].sort());
            }}
          />
        </View>
      );
    }
    return null;
  };

  return (
    <ModalCard visible={p.visible} onClose={p.onClose}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('task.repeat')}</Text>
        <Pressable onPress={p.onClose} hitSlop={10} accessibilityRole="button">
          <Text style={styles.done}>{t('common.done')}</Text>
        </Pressable>
      </View>
      {REPEAT_OPTIONS.map(({ mode, labelKey }, i) => {
        const sel = p.mode === mode;
        return (
          <View key={mode} style={i > 0 && styles.divider}>
            <Pressable
              style={styles.option}
              onPress={() => p.onMode(mode)}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={t(labelKey)}
            >
              <View style={[styles.radio, sel && styles.radioSel]}>{sel && <View style={styles.radioDot} />}</View>
              <Text style={[styles.optionText, sel && styles.optionTextSel]}>{t(labelKey)}</Text>
            </Pressable>
            {sel && settings(mode)}
          </View>
        );
      })}
    </ModalCard>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    title: { fontSize: 18, fontWeight: '700', color: c.text },
    done: { fontSize: 15, fontWeight: '700', color: c.primary },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50 },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: c.faint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSel: { borderColor: c.primary },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.primary },
    optionText: { flex: 1, fontSize: 15, color: c.text },
    optionTextSel: { fontWeight: '700' },
    // Seven equal circles, whatever the day names' length.
    weekRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, paddingLeft: 32, paddingBottom: 14 },
    day: {
      flex: 1,
      maxWidth: 40,
      aspectRatio: 1,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    daySel: { borderColor: c.primary, backgroundColor: c.primary },
    dayText: { fontSize: 12, fontWeight: '700', color: c.muted },
    dayTextSel: { color: c.onAccent },
    numRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingLeft: 32, paddingBottom: 14 },
    numLabel: { fontSize: 14, fontWeight: '600', color: c.text },
    numInput: {
      width: 56,
      textAlign: 'center',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingVertical: 8,
      fontSize: 15,
      color: c.text,
      backgroundColor: c.inputBg,
    },
    numHint: { flexBasis: '100%', fontSize: 12, color: c.faint },
    dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 32, paddingBottom: 14 },
    dateChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
  });
