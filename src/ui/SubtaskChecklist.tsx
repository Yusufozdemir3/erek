// The subtasks of a task, opened inside its list card (Today / Tasks): rows are
// 48px and the whole row ticks, so a shopping list can be worked through
// without opening the edit form. A task shared WITH me ticks through the
// server (toggleSharedSubtaskOptimistic); my own tick locally and may complete
// the parent. Architecture rule: no SQL — repo calls only.

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { subtaskRepo } from '@/db';
import type { Subtask, Task } from '@/db';
import { useI18n } from '@/i18n/I18nProvider';
import { tapLight } from '@/lib/haptics';
import { syncTaskCompletionFromSubtasks } from '@/ui/subtaskActions';
import { toggleSharedSubtaskOptimistic, useFriendNames } from '@/ui/sharedTaskUi';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from '@/ui/theme';

export const SUBTASK_ROW_HEIGHT = 48;

interface Props {
  task: Task;
  // The list's "done/total" for this task: changes when a pull or an edit
  // elsewhere touched the subtasks, so the open checklist reloads.
  refreshKey: string;
  onChanged: () => void; // the list behind refreshes (counts, completion)
}

export function SubtaskChecklist({ task, refreshKey, onChanged }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const [items, setItems] = useState<Subtask[]>(() => subtaskRepo.listByTask(task.id));
  const tickerNames = useFriendNames(items.map((s) => s.completed_by));

  const load = useCallback(() => setItems(subtaskRepo.listByTask(task.id)), [task.id]);
  useEffect(load, [load, refreshKey]);

  const toggle = (s: Subtask) => {
    if (task.shared_owner_uid) {
      toggleSharedSubtaskOptimistic(
        s,
        () => {
          load();
          onChanged();
        },
        t
      );
      return;
    }
    subtaskRepo.setCompleted(s.id, s.completed === 0);
    tapLight();
    syncTaskCompletionFromSubtasks(task.id);
    load();
    onChanged();
  };

  return (
    <View style={styles.list}>
      {items.map((s) => {
        const done = s.completed === 1;
        const by = done && s.completed_by ? tickerNames.get(s.completed_by) : undefined;
        return (
          <Pressable
            key={s.id}
            style={styles.row}
            onPress={() => toggle(s)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={s.title}
          >
            <View style={[styles.box, done && styles.boxDone]}>
              {done && <Feather name="check" size={14} color={colors.onAccent} />}
            </View>
            <Text style={[styles.title, done && styles.titleDone]} numberOfLines={2}>
              {s.title}
              {by ? <Text style={styles.by}> · {t('sharedTask.tickedBy', { name: by })}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// "2/5" and a thin bar under a card's title.
export function SubtaskProgress({ done, total }: { done: number; total: number }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <View style={styles.progressRow}>
      <Text style={styles.progressText}>
        {done}/{total}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    list: { marginTop: 4 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: SUBTASK_ROW_HEIGHT,
      gap: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    box: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxDone: { backgroundColor: c.done, borderColor: c.done },
    title: { flex: 1, fontSize: 15, fontWeight: '500', color: c.text },
    titleDone: { color: c.faint, fontWeight: '400', textDecorationLine: 'line-through' },
    by: { fontSize: 11, color: c.faint, fontWeight: '400' },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    progressText: { fontSize: 12, color: c.muted },
    track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.border, overflow: 'hidden' },
    fill: { height: 4, backgroundColor: c.done, borderRadius: 2 },
  });
