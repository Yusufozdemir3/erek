// Task edit panel (a modal that centers the page).
// Opens when a task is tapped on the "Today"/"Tasks" screen. Title, priority, due
// date, and time fields live in the shared TaskForm component; this file is just
// the modal shell + persistence (update/delete) and the subtask (checklist) section.
// Note: title/priority/date are written on "Save"; subtasks are written
// IMMEDIATELY (checklist behavior) — onChanged fires on every change so the
// "1/3 subtasks" badge on the list behind it stays current. The creation side
// (AddSheet) uses the same TaskForm but without the subtask section.
// Architectural rule: no SQL - only taskRepo/subtaskRepo are called.

import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { reminderRepo, subtaskRepo, taskRepo } from '@/db';
import type { Subtask, Task } from '@/db';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { cancelTaskReminders, refreshTaskReminders, scheduleTaskReminders } from '@/lib/notifications';
import { TITLE_MAX_LEN } from '@/ui/formLimits';
import { ModalCard } from '@/ui/ModalCard';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';
import { TaskForm, type TaskFormValues } from '@/ui/TaskForm';

interface Props {
  task: Task | null; // null = panel closed
  onClose: () => void;
  onChanged: () => void; // let the parent refresh the list after save/delete
}

export function TaskEditModal({ task, onClose, onChanged }: Props) {
  const { colors } = useTheme();
  const { t: tr } = useI18n();
  const styles = makeStyles(colors);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtask, setNewSubtask] = useState('');

  // Load subtasks for the selected task every time the panel opens.
  useEffect(() => {
    if (task) {
      setSubtasks(subtaskRepo.listByTask(task.id));
      setNewSubtask('');
    }
  }, [task]);

  if (!task) return null;

  // Auto-completes the parent task once all subtasks are done; if one is
  // reopened (or a new incomplete subtask is added), reopens the parent too.
  // This rule never kicks in for a task with no subtasks.
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
      // A recurring task may have advanced (still not completed, but with a new
      // date) — the decision is made by looking at the current DB state.
      refreshTaskReminders(task.id);
    } else if (!shouldBeCompleted && isCompleted) {
      taskRepo.setCompleted(task.id, false);
      tapLight();
      // Reopened — reminders should return if it's not yet overdue (same
      // function: reschedules since the task is no longer completed).
      refreshTaskReminders(task.id);
    }
  };

  // Subtask changes are written immediately; both the in-panel list and the
  // screen behind it (badge counts) get refreshed.
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
      recurrence: values.recurrence,
    });
    const reminders = reminderRepo.replaceAll('task', task.id, values.remind_times);
    // Date/time/reminders may have changed — reminders are rescheduled based on the current values.
    const updated = taskRepo.getById(task.id);
    if (updated) {
      scheduleTaskReminders(updated, reminders).then((ok) => {
        if (!ok) Alert.alert(tr('notif.noPermTitle'), tr('notif.noPermBody'));
      });
    }
    onChanged();
    onClose();
  };

  const handleDelete = () => {
    taskRepo.softDelete(task.id);
    cancelTaskReminders(task.id).catch((e) =>
      console.warn('[Notification] Failed to cancel reminders for deleted task:', e)
    );
    onChanged();
    onClose();
  };

  return (
    <ModalCard visible onClose={onClose}>
      <Text style={styles.heading}>{tr('task.edit')}</Text>
      {/* key: when switching to a different task, the form is remounted with fresh initial values */}
      <TaskForm
        key={task.id}
        initial={{
          title: task.title,
          priority: task.priority,
          due_date: task.due_date,
          end_time: task.end_time,
          recurrence: task.recurrence,
          remind_times: reminderRepo.listByEntity('task', task.id).map((r) => r.time),
        }}
        submitLabel={tr('common.save')}
        onSubmit={handleSave}
        onDelete={handleDelete}
      >
            {/* Subtasks — saved immediately (doesn't wait for Save) */}
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
                  <Pressable
                    onPress={() => removeSubtask(s)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={tr('task.removeSubtaskA11y', { title: s.title })}
                  >
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
              <Pressable
                style={styles.subtaskAddBtn}
                onPress={addSubtask}
                accessibilityRole="button"
                accessibilityLabel={tr('task.addSubtask')}
              >
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
