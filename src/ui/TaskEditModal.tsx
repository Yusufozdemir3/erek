// Görev düzenleme paneli (alttan açılan modal).
// "Bugün"/"Görevler" ekranında bir göreve dokununca açılır. Başlık, öncelik, son
// tarih ve saat alanları ortak TaskForm bileşeninde; burası yalnızca modal kabuğu
// + kalıcılık (update/delete) ve alt görev (checklist) bölümü.
// Not: başlık/öncelik/tarih "Kaydet" ile yazılır; alt görevler ise ANINDA yazılır
// (checklist davranışı) — her değişiklikte onChanged tetiklenir ki arkadaki
// listedeki "1/3 alt görev" rozeti güncel kalsın. Oluşturma tarafı (AddSheet) aynı
// TaskForm'u kullanır ama alt görev bölümü olmadan.
// Mimari kural: SQL yok - yalnızca taskRepo/subtaskRepo çağrılır.

import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { subtaskRepo, taskRepo } from '@/db';
import type { Subtask, Task } from '@/db';
import { TaskForm, type TaskFormValues } from '@/ui/TaskForm';

interface Props {
  task: Task | null; // null = panel kapalı
  onClose: () => void;
  onChanged: () => void; // kaydet/sil sonrası parent listeyi tazelesin
}

export function TaskEditModal({ task, onClose, onChanged }: Props) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtask, setNewSubtask] = useState('');

  // Panel her açıldığında alt görevleri seçilen görevden yükle.
  useEffect(() => {
    if (task) {
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

  const handleSave = (values: TaskFormValues) => {
    taskRepo.update(task.id, {
      title: values.title,
      priority: values.priority,
      due_date: values.due_date,
    });
    onChanged();
    onClose();
  };

  const handleDelete = () => {
    taskRepo.softDelete(task.id);
    onChanged();
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* Arka plan - dokununca kapanır */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>Görevi düzenle</Text>
          {/* key: farklı göreve geçince form taze başlangıç değerleriyle kurulur */}
          <TaskForm
            key={task.id}
            initial={{ title: task.title, priority: task.priority, due_date: task.due_date }}
            submitLabel="Kaydet"
            onSubmit={handleSave}
            onDelete={handleDelete}
          >
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
            <View style={styles.subtaskAddRow}>
              <TextInput
                style={styles.subtaskInput}
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
          </TaskForm>
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
  label: { fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 8, marginTop: 4 },
  subtaskRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
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
  subtaskAddRow: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
  subtaskInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  subtaskAddBtn: {
    width: 44,
    alignSelf: 'stretch',
    borderRadius: 12,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtaskAddText: { fontSize: 20, color: '#4f46e5', fontWeight: '600' },
});
