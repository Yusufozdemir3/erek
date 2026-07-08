// Görev düzenleme paneli (sayfayı ortalayan modal).
// "Bugün"/"Görevler" ekranında bir göreve dokununca açılır. Başlık, öncelik, son
// tarih ve saat alanları ortak TaskForm bileşeninde; burası yalnızca modal kabuğu
// + kalıcılık (update/delete) ve alt görev (checklist) bölümü.
// Not: başlık/öncelik/tarih "Kaydet" ile yazılır; alt görevler ise ANINDA yazılır
// (checklist davranışı) — her değişiklikte onChanged tetiklenir ki arkadaki
// listedeki "1/3 alt görev" rozeti güncel kalsın. Oluşturma tarafı (AddSheet) aynı
// TaskForm'u kullanır ama alt görev bölümü olmadan.
// Mimari kural: SQL yok - yalnızca taskRepo/subtaskRepo çağrılır.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { subtaskRepo, taskRepo } from '@/db';
import type { Subtask, Task } from '@/db';
import { ModalCard } from '@/ui/ModalCard';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from '@/ui/theme';
import { TaskForm, type TaskFormValues } from '@/ui/TaskForm';

interface Props {
  task: Task | null; // null = panel kapalı
  onClose: () => void;
  onChanged: () => void; // kaydet/sil sonrası parent listeyi tazelesin
}

export function TaskEditModal({ task, onClose, onChanged }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
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
    <ModalCard visible onClose={onClose}>
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
                placeholderTextColor={colors.faint}
                onSubmitEditing={addSubtask}
                blurOnSubmit={false}
                returnKeyType="done"
              />
              <Pressable style={styles.subtaskAddBtn} onPress={addSubtask}>
                <Text style={styles.subtaskAddText}>＋</Text>
              </Pressable>
            </View>
          </TaskForm>
    </ModalCard>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    heading: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 16, textAlign: 'center' },
    label: { fontSize: 13, fontWeight: '600', color: c.muted, marginBottom: 8, marginTop: 4 },
    subtaskRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
    subtaskBox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subtaskBoxDone: { backgroundColor: c.done, borderColor: c.done },
    subtaskCheck: { color: c.onAccent, fontSize: 12, fontWeight: '800' },
    subtaskTitle: { flex: 1, fontSize: 14, color: c.text },
    subtaskTitleDone: { color: c.faint, textDecorationLine: 'line-through' },
    subtaskDelete: { fontSize: 20, color: c.faint, paddingHorizontal: 4 },
    subtaskAddRow: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
    subtaskInput: {
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
    subtaskAddBtn: {
      width: 44,
      alignSelf: 'stretch',
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subtaskAddText: { fontSize: 20, color: c.primary, fontWeight: '600' },
  });
