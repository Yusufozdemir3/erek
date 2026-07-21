// Çoklu hatırlatma saati düzenleyici — HabitForm/TaskForm/GoalForm'un üçü de
// kullanır (tekil remind_at yerine "HH:MM" listesi; bkz. reminderRepo).
// Saf UI: liste + saat seçici burada, kalıcılık (reminderRepo.replaceAll) ve
// bildirim programlaması çağırana ait (diğer form alanlarıyla aynı desen —
// onSubmit'e kadar hiçbir şey yazılmaz).

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { hmToDate, toHm } from '@/lib/helpers';
import { TimePickerModal } from '@/ui/TimePickerModal';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';

interface Props {
  label: string; // "Hatırlatma saati" | "Hatırlatma" | "Günlük hatırlatma" — çağıran verir
  times: string[];
  onChange: (times: string[]) => void;
}

export function ReminderListEditor({ label, times, onChange }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const [showPicker, setShowPicker] = useState(false);

  const addTime = (picked: Date) => {
    const hm = toHm(picked);
    if (!times.includes(hm)) onChange([...times, hm].sort());
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
        <Pressable style={styles.addBtn} onPress={() => setShowPicker(true)}>
          <Text style={styles.addBtnText}>＋ {t('reminders.add')}</Text>
        </Pressable>
      </View>
      {times.length === 0 && <Text style={styles.hint}>{t('reminders.none')}</Text>}

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
