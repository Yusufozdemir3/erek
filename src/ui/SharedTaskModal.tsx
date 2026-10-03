// A task a friend shared WITH me, opened from the Today/Tasks lists: the task
// and its subtasks, where each subtask can be ticked (the one write path a
// recipient has, see sync/sharedTasks.ts). Nothing else is editable here —
// titles, order and deletion stay with the owner. The parent task completes
// and reopens with its subtasks, decided server-side.
// Architecture rule: no SQL — repo calls only.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { subtaskRepo, taskRepo } from '@/db';
import type { Subtask, Task } from '@/db';
import { useI18n } from '@/i18n/I18nProvider';
import { ModalCard } from '@/ui/ModalCard';
import { toggleSharedSubtaskOptimistic } from '@/ui/sharedTaskUi';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from '@/ui/theme';

interface Props {
  task: Task | null; // null = closed
  ownerName: string;
  onClose: () => void;
  onChanged: () => void; // the list behind refreshes (badge counts, completion)
}

export function SharedTaskModal({ task, ownerName, onClose, onChanged }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const taskId = task?.id;

  const load = () => {
    if (!taskId) return;
    setSubtasks(subtaskRepo.listByTask(taskId));
    setCompletedAt(taskRepo.getById(taskId)?.completed_at ?? null);
  };

  useEffect(load, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!task) return null;

  const done = subtasks.filter((s) => s.completed === 1).length;

  const toggle = (s: Subtask) => {
    toggleSharedSubtaskOptimistic(
      s,
      () => {
        load();
        onChanged();
      },
      t,
      // The share ended while this was open: the next sync removes the task.
      onClose
    );
  };

  return (
    <ModalCard visible onClose={onClose}>
      <Text style={styles.heading}>{task.title}</Text>
      <Text style={styles.from}>{t('sharedTask.from', { name: ownerName })}</Text>

      <View style={styles.labelRow}>
        <Text style={styles.label}>{t('task.subtasks')}</Text>
        <Text style={styles.count} accessibilityLabel={t('sharedTask.progressA11y', { done, total: subtasks.length })}>
          {done}/{subtasks.length}
        </Text>
      </View>

      {subtasks.map((s) => {
        const checked = s.completed === 1;
        return (
          <Pressable
            key={s.id}
            style={styles.row}
            onPress={() => toggle(s)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={s.title}
          >
            <View style={[styles.box, checked && styles.boxDone]}>{checked && <Text style={styles.check}>✓</Text>}</View>
            <Text style={[styles.title, checked && styles.titleDone]}>{s.title}</Text>
          </Pressable>
        );
      })}

      {completedAt !== null && <Text style={styles.completed}>{t('sharedTask.completed')}</Text>}
      <Text style={styles.hint}>{t('sharedTask.hint', { name: ownerName })}</Text>

      <Pressable style={styles.closeBtn} onPress={onClose} accessibilityRole="button">
        <Text style={styles.closeText}>{t('common.close')}</Text>
      </Pressable>
    </ModalCard>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    heading: { fontSize: 18, fontWeight: '700', color: c.text, textAlign: 'center' },
    from: { fontSize: 13, color: c.muted, textAlign: 'center', marginTop: 4, marginBottom: 16 },
    labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 4 },
    label: { fontSize: 13, fontWeight: '600', color: c.muted },
    count: { fontSize: 13, fontWeight: '700', color: c.muted },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 12, minHeight: 44 },
    box: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxDone: { backgroundColor: c.done, borderColor: c.done },
    check: { color: c.onAccent, fontSize: 13, fontWeight: '800' },
    title: { flex: 1, fontSize: 15, color: c.text },
    titleDone: { color: c.faint, textDecorationLine: 'line-through' },
    completed: { fontSize: 13, fontWeight: '700', color: c.done, marginTop: 8 },
    hint: { fontSize: 12, color: c.faint, marginTop: 12 },
    closeBtn: {
      marginTop: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      minHeight: 48,
    },
    closeText: { fontSize: 15, fontWeight: '700', color: c.muted },
  });
