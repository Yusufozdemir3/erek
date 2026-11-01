// The task edit modal: TaskForm plus saving, deleting and the subtask section.
// Fields are saved on "Save"; subtasks are written immediately, with
// onChanged on each change so the list's "1/3" badge stays current.

import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { reminderRepo, subtaskRepo, taskRepo } from '@/db';
import type { Subtask, Task } from '@/db';
import { cancelTaskReminders, scheduleTaskReminders } from '@/lib/notifications';
import { ModalCard } from '@/ui/ModalCard';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';
import { SubtaskEditor } from '@/ui/SubtaskEditor';
import { syncTaskCompletionFromSubtasks } from '@/ui/subtaskActions';
import { TaskForm, type TaskFormValues } from '@/ui/TaskForm';
import { useFriendNames, useFriends } from '@/ui/sharedTaskUi';

interface Props {
  task: Task | null; // null = panel closed
  onClose: () => void;
  onChanged: () => void;
}

export function TaskEditModal({ task, onClose, onChanged }: Props) {
  const { colors } = useTheme();
  const { t: tr } = useI18n();
  const styles = makeStyles(colors);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const friends = useFriends(true);
  const tickerNames = useFriendNames(subtasks.map((s) => s.completed_by));

  useEffect(() => {
    if (task) {
      setSubtasks(subtaskRepo.listByTask(task.id));
    }
  }, [task]);

  if (!task) return null;

  const refreshSubtasks = () => {
    syncTaskCompletionFromSubtasks(task.id);
    setSubtasks(subtaskRepo.listByTask(task.id));
    onChanged();
  };

  const addSubtasks = (titles: string[]) => {
    subtaskRepo.createMany(task.id, titles);
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

  const renameSubtask = (s: Subtask, title: string) => {
    subtaskRepo.rename(s.id, title);
    refreshSubtasks();
  };

  const reorderSubtasks = (orderedIds: string[]) => {
    subtaskRepo.reorder(task.id, orderedIds);
    refreshSubtasks();
  };

  const handleSave = (values: TaskFormValues) => {
    taskRepo.update(task.id, {
      title: values.title,
      priority: values.priority,
      due_date: values.due_date,
      end_time: values.end_time,
      recurrence: values.recurrence,
      shared_with_ids: values.shared_with_ids,
      icon: values.icon,
      tag_ids: values.tag_ids,
    });
    const reminders = reminderRepo.replaceAll('task', task.id, values.remind_times);
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
      {/* key: a different task remounts the form */}
      <TaskForm
        key={task.id}
        initial={{
          title: task.title,
          priority: task.priority,
          due_date: task.due_date,
          end_time: task.end_time,
          recurrence: task.recurrence,
          remind_times: reminderRepo.listByEntity('task', task.id).map((r) => r.time),
          shared_with_ids: task.shared_with_ids,
          icon: task.icon,
          tag_ids: task.tag_ids,
        }}
        shareFriends={friends}
        submitLabel={tr('common.save')}
        onSubmit={handleSave}
        onDelete={handleDelete}
      >
            {/* Saved immediately */}
            <SubtaskEditor
              items={subtasks}
              tickerNames={tickerNames}
              onToggle={toggleSubtask}
              onRemove={removeSubtask}
              onRename={renameSubtask}
              onReorder={reorderSubtasks}
              onAdd={addSubtasks}
            />
          </TaskForm>
    </ModalCard>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    heading: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 16, textAlign: 'center' },
  });
