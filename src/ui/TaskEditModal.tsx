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
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { subtaskRepo, taskRepo } from '@/db';
import type { Subtask, Task } from '@/db';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { cancelTaskReminder, scheduleTaskReminder } from '@/lib/notifications';
import { TITLE_MAX_LEN } from '@/ui/formLimits';
import { ModalCard } from '@/ui/ModalCard';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';
import { TaskForm, type TaskFormValues } from '@/ui/TaskForm';

interface Props {
  task: Task | null; // null = panel kapalı
  onClose: () => void;
  onChanged: () => void; // kaydet/sil sonrası parent listeyi tazelesin
}

export function TaskEditModal({ task, onClose, onChanged }: Props) {
  const { colors } = useTheme();
  const { t: tr } = useI18n();
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

  // Tüm alt görevler tamamlanınca ana görevi otomatik tamamlar; biri geri
  // açılırsa (ya da yeni tamamlanmamış alt görev eklenirse) ana görevi de geri
  // açar. Alt görevi olmayan bir görevde bu kural hiç devreye girmez.
  const syncParentCompletion = () => {
    const { done, total } = subtaskRepo.countForTask(task.id);
    if (total === 0) return;
    const current = taskRepo.getById(task.id);
    if (!current) return;
    const shouldBeCompleted = done === total;
    const isCompleted = current.completed_at !== null;
    if (shouldBeCompleted && !isCompleted) {
      taskRepo.setCompleted(task.id, true);
      notifySuccess();
      cancelTaskReminder(task.id); // tamamlandı — saatli hatırlatma varsa gerek kalmadı
    } else if (!shouldBeCompleted && isCompleted) {
      taskRepo.setCompleted(task.id, false);
      tapLight();
      const reopened = taskRepo.getById(task.id);
      if (reopened) scheduleTaskReminder(reopened); // geri açıldı — vadesi geçmemişse hatırlatma dönsün
    }
  };

  // Alt görev değişiklikleri anında yazılır; hem panel içi liste hem arkadaki
  // ekran (rozet sayıları) tazelenir.
  const refreshSubtasks = () => {
    syncParentCompletion();
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
      end_time: values.end_time,
    });
    // Tarih/saat değişmiş olabilir — hatırlatma güncel değere göre yeniden kurulur.
    const updated = taskRepo.getById(task.id);
    if (updated) {
      scheduleTaskReminder(updated).then((ok) => {
        if (!ok) Alert.alert(tr('notif.noPermTitle'), tr('notif.noPermBody'));
      });
    }
    onChanged();
    onClose();
  };

  const handleDelete = () => {
    taskRepo.softDelete(task.id);
    cancelTaskReminder(task.id);
    onChanged();
    onClose();
  };

  return (
    <ModalCard visible onClose={onClose}>
      <Text style={styles.heading}>{tr('task.edit')}</Text>
      {/* key: farklı göreve geçince form taze başlangıç değerleriyle kurulur */}
      <TaskForm
        key={task.id}
        initial={{ title: task.title, priority: task.priority, due_date: task.due_date, end_time: task.end_time }}
        submitLabel={tr('common.save')}
        onSubmit={handleSave}
        onDelete={handleDelete}
      >
            {/* Alt görevler — anında kaydedilir (Kaydet beklemez) */}
            <Text style={styles.label}>{tr('task.subtasks')}</Text>
            {subtasks.map((s) => {
              const done = s.completed === 1;
              return (
                <View key={s.id} style={styles.subtaskRow}>
                  <Pressable
                    onPress={() => toggleSubtask(s)}
                    hitSlop={8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done }}
                    accessibilityLabel={s.title}
                  >
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
                placeholder={tr('task.addSubtask')}
                placeholderTextColor={colors.faint}
                onSubmitEditing={addSubtask}
                blurOnSubmit={false}
                returnKeyType="done"
                maxLength={TITLE_MAX_LEN}
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
