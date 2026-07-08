// Görev form ALANLARI — hem oluşturma (AddSheet) hem düzenleme (TaskEditModal)
// tarafından paylaşılır (HabitForm ile aynı desen). Alanlar, durum ve doğrulama
// burada; kalıcılık (create/update), alt görev bölümü ve modal/sheet kabuğu
// çağırana aittir. onSubmit son (dönüştürülmüş) değerleri yukarı verir.
// Alt görevler oluşturmada YOK (yalnız sonradan, düzenleme panelinde) — bu
// yüzden düzenleme tarafı alt görev bölümünü `children` olarak geçer.
// Mimari kural: SQL yok — yalnızca çağıran repo yazar.

import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { Priority } from '@/db';
import { extractTime, hmToDate, toHm, toYmd } from '@/lib/helpers';
import { ConfirmDeleteButton } from '@/ui/ConfirmDeleteButton';
import { useTheme } from '@/ui/ThemeProvider';
import { longDateLabel, PRIORITY_COLOR, PRIORITY_LABEL, PRIORITY_ORDER, type Colors } from '@/ui/theme';

// taskRepo.create/update'in beklediği alanlarla örtüşür (due_date saat gömülü).
export interface TaskFormValues {
  title: string;
  priority: Priority;
  due_date: string | null; // "YYYY-MM-DD" | "YYYY-MM-DDTHH:MM:SS" | null
}

interface Props {
  initial?: Partial<{ title: string; priority: Priority; due_date: string | null }>;
  submitLabel: string;                  // "Kaydet" | "Ekle"
  onSubmit: (values: TaskFormValues) => void;
  onDelete?: () => void;                // yalnız düzenlemede: Sil düğmesi
  autoFocusTitle?: boolean;             // oluşturmada klavye hemen açılsın
  children?: ReactNode;                 // düzenlemede alt görev bölümü (eylemlerin üstünde)
}

// "08:30" -> okunaklı etiket; null ise "Saat yok".
function timeLabel(hm: string | null): string {
  return hm ? hm : 'Saat yok';
}

export function TaskForm({ initial, submitLabel, onSubmit, onDelete, autoFocusTitle, children }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState<string | null>(
    initial?.due_date ? initial.due_date.slice(0, 10) : null
  );
  const [dueTime, setDueTime] = useState<string | null>(extractTime(initial?.due_date ?? null));
  const [showPicker, setShowPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    // Saat yalnızca bir tarih seçiliyken anlamlıdır.
    const due_date = dueDate ? (dueTime ? `${dueDate}T${dueTime}:00` : dueDate) : null;
    onSubmit({ title: t, priority, due_date });
  };

  // Android'de seçici tek seferlik bir dialog; iOS'ta satır içi kalır.
  const onPickDate = (_event: unknown, picked?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (picked) setDueDate(toYmd(picked));
  };

  const onPickTime = (_event: unknown, picked?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (picked) setDueTime(toHm(picked));
  };

  return (
    <>
      {/* Başlık */}
      <Text style={styles.label}>Başlık</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Görev başlığı"
        placeholderTextColor={colors.faint}
        autoFocus={autoFocusTitle}
      />

      {/* Öncelik */}
      <Text style={styles.label}>Öncelik</Text>
      <View style={styles.row}>
        {PRIORITY_ORDER.map((p) => {
          const selected = p === priority;
          const color = PRIORITY_COLOR[p];
          return (
            <Pressable
              key={p}
              style={[styles.chip, selected && { backgroundColor: color, borderColor: color }]}
              onPress={() => setPriority(p)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {PRIORITY_LABEL[p]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Son tarih */}
      <Text style={styles.label}>Son tarih</Text>
      <View style={styles.row}>
        <Pressable style={styles.dateBtn} onPress={() => setShowPicker(true)}>
          <Text style={styles.dateBtnText}>{longDateLabel(dueDate)}</Text>
        </Pressable>
        {dueDate && (
          <Pressable
            style={styles.clearBtn}
            onPress={() => {
              setDueDate(null);
              setDueTime(null);
            }}
          >
            <Text style={styles.clearBtnText}>Temizle</Text>
          </Pressable>
        )}
      </View>

      {showPicker && (
        <DateTimePicker
          value={dueDate ? new Date(`${dueDate}T00:00:00`) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={onPickDate}
        />
      )}

      {/* Saat — yalnızca bir tarih seçiliyken anlamlı */}
      {dueDate && (
        <>
          <Text style={styles.label}>Saat (isteğe bağlı)</Text>
          <View style={styles.row}>
            <Pressable style={styles.dateBtn} onPress={() => setShowTimePicker(true)}>
              <Text style={styles.dateBtnText}>{timeLabel(dueTime)}</Text>
            </Pressable>
            {dueTime && (
              <Pressable style={styles.clearBtn} onPress={() => setDueTime(null)}>
                <Text style={styles.clearBtnText}>Temizle</Text>
              </Pressable>
            )}
          </View>

          {showTimePicker && (
            <DateTimePicker
              value={hmToDate(dueTime)}
              mode="time"
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onPickTime}
            />
          )}
        </>
      )}

      {/* Düzenlemede alt görev bölümü buraya gelir (oluşturmada yok). */}
      {children}

      {/* Eylemler — Sil yalnız düzenlemede (onDelete varsa) */}
      <View style={styles.actions}>
        {onDelete && <ConfirmDeleteButton onConfirm={onDelete} />}
        <Pressable style={styles.saveBtn} onPress={submit}>
          <Text style={styles.saveBtnText}>{submitLabel}</Text>
        </Pressable>
      </View>
    </>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    label: { fontSize: 13, fontWeight: '600', color: c.muted, marginBottom: 8, marginTop: 4 },
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
    chip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    chipText: { fontSize: 14, fontWeight: '600', color: c.muted },
    chipTextSelected: { color: c.onAccent },
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
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: c.primary,
    },
    saveBtnText: { fontSize: 15, fontWeight: '700', color: c.onAccent },
  });
