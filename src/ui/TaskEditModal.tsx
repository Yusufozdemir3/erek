// Görev düzenleme paneli (alttan açılan modal).
// "Bugün" ekranında bir göreve dokununca açılır. Başlık, öncelik ve son tarih
// düzenlenir; görev buradan silinebilir (soft delete).
// Mimari kural: SQL yok - yalnızca taskRepo çağrılır.

import { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { taskRepo } from '@/db';
import type { Priority, Task } from '@/db';
import { toYmd } from '@/lib/helpers';
import { ConfirmDeleteButton } from '@/ui/ConfirmDeleteButton';
import { longDateLabel, PRIORITY_COLOR, PRIORITY_LABEL, PRIORITY_ORDER } from '@/ui/theme';

interface Props {
  task: Task | null; // null = panel kapalı
  onClose: () => void;
  onChanged: () => void; // kaydet/sil sonrası parent listeyi tazelesin
}

export function TaskEditModal({ task, onClose, onChanged }: Props) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState<string | null>(null); // "YYYY-MM-DD" | null
  const [showPicker, setShowPicker] = useState(false);

  // Panel her açıldığında formu seçilen görevin değerleriyle doldur.
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setPriority(task.priority);
      setDueDate(task.due_date ? task.due_date.slice(0, 10) : null);
      setShowPicker(false);
    }
  }, [task]);

  if (!task) return null;

  const save = () => {
    const t = title.trim();
    if (!t) return;
    taskRepo.update(task.id, { title: t, priority, due_date: dueDate });
    onChanged();
    onClose();
  };

  const remove = () => {
    taskRepo.softDelete(task.id);
    onChanged();
    onClose();
  };

  // Android'de seçici tek seferlik bir dialog; iOS'ta satır içi kalır.
  const onPickDate = (_event: unknown, picked?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (picked) setDueDate(toYmd(picked));
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* Arka plan - dokununca kapanır */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.heading}>Görevi düzenle</Text>

        {/* Başlık */}
        <Text style={styles.label}>Başlık</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Görev başlığı"
          placeholderTextColor="#94a3b8"
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
            <Pressable style={styles.clearBtn} onPress={() => setDueDate(null)}>
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

        {/* Eylemler */}
        <View style={styles.actions}>
          <ConfirmDeleteButton onConfirm={remove} />
          <Pressable style={styles.saveBtn} onPress={save}>
            <Text style={styles.saveBtnText}>Kaydet</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 16,
  },
  heading: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  row: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  chipText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  chipTextSelected: { color: '#fff' },
  dateBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  dateBtnText: { fontSize: 15, color: '#0f172a' },
  clearBtn: { paddingVertical: 12, paddingHorizontal: 14 },
  clearBtnText: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  saveBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4f46e5',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
