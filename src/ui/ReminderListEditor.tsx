// The reminder-times editor of the habit, task and goal forms. UI only: saving
// and scheduling happen in the caller on submit.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { hmToDate, toHm } from '@/lib/helpers';
import { reminderLimit } from '@/plus/plusLogic';
import { promptPlus } from '@/plus/openPlus';
import { useFeaturesUnlocked } from '@/plus/plusStore';
import { TimePickerModal } from '@/ui/TimePickerModal';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';

interface Props {
  label: string;
  times: string[];
  onChange: (times: string[]) => void;
  // In a narrow column: no "no reminders yet" line under an empty list.
  compact?: boolean;
}

export function ReminderListEditor({ label, times, onChange, compact = false }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const [showPicker, setShowPicker] = useState(false);
  const unlocked = useFeaturesUnlocked();
  const limit = reminderLimit(unlocked);

  // Checked here as well as by hiding the button (the picker may already be open).
  // Existing reminders beyond a free limit stay; only adding stops.
  const atMax = times.length >= limit;

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
        {atMax && !unlocked && (
          <Pressable
            style={styles.addBtn}
            onPress={() => promptPlus('reminders', t)}
            accessibilityRole="button"
          >
            <Text style={styles.addBtnText}>{t('reminders.morePlus')}</Text>
          </Pressable>
        )}
      </View>
      {times.length === 0 && !compact && <Text style={styles.hint}>{t('reminders.none')}</Text>}
      {atMax && unlocked && <Text style={styles.hint}>{t('reminders.max', { n: limit })}</Text>}

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
