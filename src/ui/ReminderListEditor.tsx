// Multi reminder-time editor — used by all three of HabitForm/TaskForm/GoalForm
// (a list of "HH:MM" instead of a single remind_at; see reminderRepo).
// Pure UI: the list + time picker live here, while persistence
// (reminderRepo.replaceAll) and notification scheduling belong to the caller
// (same pattern as the other form fields — nothing is written until onSubmit).

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { hmToDate, toHm } from '@/lib/helpers';
import { MAX_REMINDERS_PER_ENTITY } from '@/ui/formLimits';
import { TimePickerModal } from '@/ui/TimePickerModal';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';

interface Props {
  label: string; // "Reminder time" | "Reminder" | "Daily reminder" — provided by the caller
  times: string[];
  onChange: (times: string[]) => void;
}

export function ReminderListEditor({ label, times, onChange }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const [showPicker, setShowPicker] = useState(false);

  // The cap is enforced both here and by hiding the button: if the list fills up
  // while the picker is already open (or a future caller adds one), it should
  // never be silently exceeded.
  const atMax = times.length >= MAX_REMINDERS_PER_ENTITY;

  const addTime = (picked: Date) => {
    const hm = toHm(picked);
    if (atMax || times.includes(hm)) return;
    onChange([...times, hm].sort());
  };
  const removeTime = (hm: string) => onChange(times.filter((x) => x !== hm));

  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {times.map((hm) => (
          <Pressable
            key={hm}
            style={styles.chip}
            onPress={() => removeTime(hm)}
            accessibilityRole="button"
            accessibilityLabel={t('reminders.removeA11y', { time: hm })}
          >
            <Text style={styles.chipText}>{hm} ×</Text>
          </Pressable>
        ))}
        {!atMax && (
          <Pressable style={styles.addBtn} onPress={() => setShowPicker(true)}>
            <Text style={styles.addBtnText}>＋ {t('reminders.add')}</Text>
          </Pressable>
        )}
      </View>
      {times.length === 0 && <Text style={styles.hint}>{t('reminders.none')}</Text>}
      {atMax && (
        <Text style={styles.hint}>{t('reminders.max', { n: MAX_REMINDERS_PER_ENTITY })}</Text>
      )}

      <TimePickerModal
        visible={showPicker}
        value={hmToDate(null)}
        onClose={() => setShowPicker(false)}
        onConfirm={(picked) => {
          addTime(picked);
          setShowPicker(false);
        }}
      />
    </>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    label: { fontSize: 13, fontWeight: '600', color: c.muted, marginBottom: 8, marginTop: 4 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
    },
    chipText: { fontSize: 13, fontWeight: '700', color: c.primary },
    addBtn: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    addBtnText: { fontSize: 13, fontWeight: '600', color: c.muted },
    hint: { fontSize: 12, color: c.faint, marginTop: -6, marginBottom: 12 },
  });
