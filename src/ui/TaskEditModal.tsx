// Görev düzenleme paneli (alttan açılan modal).
// "Bugün" ekranında bir göreve dokununca açılır. Başlık, öncelik, son tarih ve
// alt görevler (checklist) düzenlenir; görev buradan silinebilir (soft delete).
// Not: başlık/öncelik/tarih "Kaydet" ile yazılır; alt görevler ise ANINDA
// yazılır (checklist davranışı) — her değişiklikte onChanged tetiklenir ki
// arkadaki listedeki "1/3 alt görev" rozeti güncel kalsın.
// Mimari kural: SQL yok - yalnızca taskRepo/subtaskRepo çağrılır.

import { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { subtaskRepo, taskRepo } from '@/db';
import type { Priority, Subtask, Task } from '@/db';
import { extractTime, hmToDate, toHm, toYmd } from '@/lib/helpers';
import { ConfirmDeleteButton } from '@/ui/ConfirmDeleteButton';
import { longDateLabel, PRIORITY_COLOR, PRIORITY_LABEL, PRIORITY_ORDER } from '@/ui/theme';

interface Props {
  task: Task | null; // null = panel kapalı
  onClose: () => void;
  onChanged: () => void; // kaydet/sil sonrası parent listeyi tazelesin
}

// "08:30" -> okunaklı etiket; null ise "Saat yok".
function timeLabel(hm: string | null): string {
  return hm ? hm : 'Saat yok';
}

export function TaskEditModal({ task, onClose, onChanged }: Props) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState<string | null>(null); // "YYYY-MM-DD" | null
  const [dueTime, setDueTime] = useState<string | null>(null); // "HH:MM" | null
  const [showPicker, setShowPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtask, setNewSubtask] = useState('');

  // Panel her açıldığında formu seçilen görevin değerleriyle doldur.
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setPriority(task.priority);
      setDueDate(task.due_date ? task.due_date.slice(0, 10) : null);
      setDueTime(extractTime(task.due_date));
      setShowPicker(false);
      setShowTimePicker(false);
      setSubtasks(subtaskRepo.listByTask(task.id));
      setNewSubtask('');
    }
  }, [task]);

  if (!task) return null;

  // Alt görev değişiklikleri anında yazılır; hem panel içi liste hem arkadaki
  // ekran (rozet sayıları) tazelenir.
  const refreshSubtasks = () => {
    setSubtasks(subtaskRepo.listByTask(task.id));
    onChanged();
  };

  const addSubtask = () => {
    const t = newSubtask.trim();
    if (!t) return;
    subtaskRepo.create(task.id, t);
    setNewSubtask('');
    refreshSubtasks();
  };

  const toggleSubtask = (s: Subtask) => {
    subtaskRepo.setCompleted(s.id, s.completed === 0);
    refreshSubtasks();
  };

  const removeSubtask = (s: Subtask) => {
    subtaskRepo.softDelete(s.id);
    refreshSubtasks();
  };

  const save = () => {
    const t = title.trim();
    if (!t) return;
    // Saat yalnızca bir tarih seçiliyken anlamlıdır.
    const due_date = dueDate ? (dueTime ? `${dueDate}T${dueTime}:00` : dueDate) : null;
    taskRepo.update(task.id, { title: t, priority, due_date });
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

  const onPickTime = (_event: unknown, picked?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (picked) setDueTime(toHm(picked));
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* Arka plan - dokununca kapanır */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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

        {/* Alt görevler — anında kaydedilir (Kaydet beklemez) */}
        <Text style={styles.label}>Alt görevler</Text>
        {subtasks.map((s) => {
          const done = s.completed === 1;
          return (
            <View key={s.id} style={styles.subtaskRow}>
              <Pressable onPress={() => toggleSubtask(s)} hitSlop={8}>
                <View style={[styles.subtaskBox, done && styles.subtaskBoxDone]}>
                  {done && <Text style={styles.subtaskCheck}>✓</Text>}
                </View>
              </Pressable>
              <Text style={[styles.subtaskTitle, done && styles.subtaskTitleDone]}>
                {s.title}
              </Text>
              <Pressable onPress={() => removeSubtask(s)} hitSlop={10}>
                <Text style={styles.subtaskDelete}>×</Text>
              </Pressable>
            </View>
          );
        })}
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            value={newSubtask}
            onChangeText={setNewSubtask}
            placeholder="Alt görev ekle…"
            placeholderTextColor="#94a3b8"
            onSubmitEditing={addSubtask}
            blurOnSubmit={false}
            returnKeyType="done"
          />
          <Pressable style={styles.subtaskAddBtn} onPress={addSubtask}>
            <Text style={styles.subtaskAddText}>＋</Text>
          </Pressable>
        </View>

        {/* Eylemler */}
        <View style={styles.actions}>
          <ConfirmDeleteButton onConfirm={remove} />
          <Pressable style={styles.saveBtn} onPress={save}>
            <Text style={styles.saveBtnText}>Kaydet</Text>
          </Pressable>
        </View>
        </ScrollView>
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
    maxHeight: '88%',
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
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  subtaskBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtaskBoxDone: { backgroundColor: '#10b981', borderColor: '#10b981' },
  subtaskCheck: { color: '#fff', fontSize: 12, fontWeight: '800' },
  subtaskTitle: { flex: 1, fontSize: 14, color: '#0f172a' },
  subtaskTitleDone: { color: '#94a3b8', textDecorationLine: 'line-through' },
  subtaskDelete: { fontSize: 20, color: '#94a3b8', paddingHorizontal: 4 },
  subtaskAddBtn: {
    width: 44,
    borderRadius: 12,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtaskAddText: { fontSize: 20, color: '#4f46e5', fontWeight: '600' },
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
