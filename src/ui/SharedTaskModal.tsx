// A task a friend shared WITH me, opened from the Today/Tasks lists: a shared
// list (shopping-list style). Every person it is shared with can tick, add and
// remove items (the write paths a recipient has, see sync/sharedTasks.ts), and
// each ticked item says who ticked it. The task's own title and deletion stay
// with the owner. The parent task completes and reopens with its items,
// decided server-side.
// Architecture rule: no SQL — repo calls only.

import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { subtaskRepo, taskRepo } from '@/db';
import type { Subtask, Task } from '@/db';
import { useI18n } from '@/i18n/I18nProvider';
import { CongratsButton } from '@/ui/CongratsButton';
import { ModalCard } from '@/ui/ModalCard';
import { getTaskParticipants } from '@/sync';
import { useOptionalAppData } from '@/ui/AppData';
import {
  addSharedSubtaskAction,
  deleteSharedSubtaskAction,
  toggleSharedSubtaskOptimistic,
  useFriendNames,
} from '@/ui/sharedTaskUi';
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
  const [newItem, setNewItem] = useState('');
  const [busy, setBusy] = useState(false);
  const [participantNames, setParticipantNames] = useState<Map<string, string>>(new Map());
  const myUid = useOptionalAppData()?.authUser?.id ?? null;
  const taskId = task?.id;
  const tickerUids = useMemo(
    () => [...new Set(subtasks.map((s) => s.completed_by).filter((u): u is string => !!u))],
    [subtasks]
  );
  const friendNames = useFriendNames(tickerUids);

  const load = () => {
    if (!taskId) return;
    setSubtasks(subtaskRepo.listByTask(taskId));
    setCompletedAt(taskRepo.getById(taskId)?.completed_at ?? null);
  };

  useEffect(load, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Names of people who may not be my friends (best effort; offline = friends only).
  useEffect(() => {
    if (!taskId) return;
    let active = true;
    getTaskParticipants(taskId).then((list) => {
      if (!active) return;
      setParticipantNames(new Map(list.filter((p) => p.displayName).map((p) => [p.id, p.displayName as string])));
    });
    return () => {
      active = false;
    };
  }, [taskId]);

  if (!task) return null;

  const done = subtasks.filter((s) => s.completed === 1).length;

  const tickedLabel = (s: Subtask): string | null => {
    if (s.completed !== 1 || !s.completed_by) return null;
    if (s.completed_by === myUid) return t('sharedTask.tickedByYou');
    const name = friendNames.get(s.completed_by) ?? participantNames.get(s.completed_by) ?? t('friends.unknownName');
    return t('sharedTask.tickedBy', { name });
  };

  const addItem = async () => {
    const title = newItem.trim();
    if (!title || busy) return;
    setBusy(true);
    const ok = await addSharedSubtaskAction(task.id, title, () => { load(); onChanged(); }, t, onClose);
    if (ok) setNewItem('');
    setBusy(false);
  };

  const removeItem = async (s: Subtask) => {
    if (busy) return;
    setBusy(true);
    await deleteSharedSubtaskAction(s, () => { load(); onChanged(); }, t, onClose);
    setBusy(false);
  };

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

      {subtasks.length > 0 && (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{t('task.subtasks')}</Text>
          <Text style={styles.count} accessibilityLabel={t('sharedTask.progressA11y', { done, total: subtasks.length })}>
            {done}/{subtasks.length}
          </Text>
        </View>
      )}

      {subtasks.map((s) => {
        const checked = s.completed === 1;
        const by = tickedLabel(s);
        return (
          <View key={s.id} style={styles.row}>
            <Pressable
              style={styles.rowMain}
              onPress={() => toggle(s)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={by ? `${s.title}, ${by}` : s.title}
            >
              <View style={[styles.box, checked && styles.boxDone]}>{checked && <Text style={styles.check}>✓</Text>}</View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, checked && styles.titleDone]}>{s.title}</Text>
                {by !== null && <Text style={styles.by}>{by}</Text>}
              </View>
            </Pressable>
            <Pressable
              onPress={() => removeItem(s)}
              hitSlop={10}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('sharedTask.removeA11y', { title: s.title })}
            >
              <Text style={styles.remove}>×</Text>
            </Pressable>
          </View>
        );
      })}

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          value={newItem}
          onChangeText={setNewItem}
          placeholder={t('sharedTask.addPlaceholder')}
          placeholderTextColor={colors.faint}
          maxLength={120}
          returnKeyType="done"
          onSubmitEditing={addItem}
          editable={!busy}
        />
        <Pressable
          style={[styles.addBtn, (!newItem.trim() || busy) && { opacity: 0.4 }]}
          onPress={addItem}
          disabled={!newItem.trim() || busy}
          accessibilityRole="button"
          accessibilityLabel={t('sharedTask.addA11y')}
        >
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </View>

      {completedAt !== null && <Text style={styles.completed}>{t('sharedTask.completed')}</Text>}
      {completedAt !== null && (
        <View style={{ alignItems: 'center' }}>
          <CongratsButton kind="task" itemId={task.id} ownerName={ownerName} title={task.title} />
        </View>
      )}
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
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
    rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
    by: { fontSize: 11, color: c.faint, marginTop: 1 },
    remove: { fontSize: 22, color: c.faint, paddingHorizontal: 6 },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: c.text,
    },
    addBtn: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.done,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnText: { color: c.onAccent, fontSize: 22, fontWeight: '700' },
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
