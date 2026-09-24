// "Tasks" tab — not just today's, but ALL active tasks.
// Difference from the "Today" screen: tasks due in the future, or with no due
// date, also show up here. Completed ones sink to the bottom of the list.
// Tapping a task opens the edit panel.
// No adding here: that happens from the ＋ menu in the tab bar.
// Architecture rule: no SQL; only taskRepo is called.
//
// VIRTUALIZATION (audit finding, P2): the list used to be drawn with
// ScrollView + .map(), meaning EVERY task was mounted at once — each one a
// SwipeableRow with its own PanResponder. Since a completed task never dropped
// out of the list, for someone using the app for a year that meant thousands
// of components: the JS thread locked up on every visit to the tab, and memory
// kept growing. Now FlatList only mounts the visible rows; the QUERY itself is
// also bounded (see taskRepo.listForScreen) — older completed tasks can be
// revealed with a single tap if wanted.

import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { reminderRepo, subtaskRepo, taskRepo } from '@/db';
import type { Task } from '@/db';
import { buildScheduleLabels, extractTime, scheduleLabel, todayDate, toYmd } from '@/lib/helpers';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { cancelTaskReminders, refreshTaskReminders } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';
import { EmptyState } from '@/ui/EmptyState';
import { PriorityMark } from '@/ui/PriorityMark';
import { ProfileButton } from '@/ui/ProfileButton';
import { SwipeableRow } from '@/ui/SwipeableRow';
import { TaskEditModal } from '@/ui/TaskEditModal';
import { TimeBadge } from '@/ui/TimeBadge';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { PRIORITY_COLOR, shortDate, type Colors } from '@/ui/theme';

// Default visibility window for completed tasks. Long enough to answer "what
// did I do yesterday", short enough not to turn the list into an archive.
const COMPLETED_WINDOW_DAYS = 30;

function shiftDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

export default function TasksScreen() {
  const { colors, shared } = useTheme();
  // Note: i18n's `t` is aliased to `tr` so it doesn't clash with the `t` (task) map variable below.
  const { t: tr, lang } = useI18n();
  const styles = makeStyles(colors);
  const { user, dataVersion } = useAppData();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  // Only one card's swipe actions may be open at a time.
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  // The "1/3 subtasks" badge on a task card; only tasks that have subtasks get an entry.
  const [subtaskCounts, setSubtaskCounts] = useState<
    Record<string, { done: number; total: number }>
  >({});
  // By default only RECENTLY completed tasks are listed; the user can expand
  // to show all (stays expanded for the session).
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const [olderCompletedCount, setOlderCompletedCount] = useState(0);

  const reload = useCallback(() => {
    // Ordering (completed ones to the bottom) now happens in SQL — no need to sort again in JS.
    const since = showAllCompleted ? null : shiftDays(todayDate(), -COMPLETED_WINDOW_DAYS);
    const list = taskRepo.listForScreen(user.id, since);
    setTasks(list);
    setOlderCompletedCount(since ? taskRepo.countCompletedBefore(user.id, since) : 0);
    // Subtask badge counts in a single query (instead of N+1); tasks with no subtasks don't show up in the result.
    setSubtaskCounts(subtaskRepo.countsForTasks(list.map((t) => t.id)));
    // dataVersion: refreshes without losing focus when a task is added from the ＋ menu.
  }, [user.id, dataVersion, showAllCompleted]);

  useFocusEffect(reload);

  const remaining = useMemo(() => tasks.filter((t) => t.completed_at === null).length, [tasks]);

  // Label set for the recurring-task badge ("🔁 Every day / Mon·Wed·Fri /
  // Every year: ...") — see helpers.buildScheduleLabels.
  const schedLabels = buildScheduleLabels(tr, (md) => shortDate(`2000-${md}`, lang));

  const toggleTask = (t: Task) => {
    const completing = t.completed_at === null;
    taskRepo.setCompleted(t.id, completing);
    completing ? notifySuccess() : tapLight();
    // Completing a recurring task may fast-forward it to its next date instead
    // of marking it done (still not completed, just re-dated) — the decision
    // is based on the current DB state (see refreshTaskReminders).
    refreshTaskReminders(t.id);
    // Re-sort (completed items sink); each card is an Animated.View +
    // LinearTransition, so the position change animates smoothly (works under Fabric too).
    reload();
  };

  const removeTask = (t: Task) => {
    taskRepo.softDelete(t.id);
    cancelTaskReminders(t.id).catch((e) =>
      console.warn('[Notification] Failed to cancel reminders for deleted task:', e)
    );
    reload();
  };

  const renderItem = useCallback(
    ({ item: t, index: i }: { item: Task; index: number }) => {
      const done = t.completed_at !== null;
      const time = extractTime(t.due_date);
      return (
        <Animated.View
          layout={LinearTransition.duration(260)}
          style={[styles.rowSpacing, i === 0 && { marginTop: 20 }]}
        >
          <SwipeableRow
            isOpen={openRowId === t.id}
            onOpenChange={(open) => setOpenRowId(open ? t.id : null)}
            onEdit={() => setEditingTask(t)}
            onDelete={() => removeTask(t)}
            editA11yLabel={tr('common.editA11y', { title: t.title })}
            deleteA11yLabel={tr('common.deleteA11y', { title: t.title })}
          >
            {/* marginBottom removed (0) — shared.card's bottom spacing now
                lives on the outer wrapper (rowSpacing); otherwise the card's
                own unpainted margin would let the action panel's color bleed
                through as a thin strip right under the card. */}
            <View style={[shared.card, styles.noMargin]}>
              {time && !done && <TimeBadge time={time} endTime={t.end_time} />}
              <Pressable
                onPress={() => toggleTask(t)}
                hitSlop={8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                accessibilityLabel={t.title}
              >
                <View
                  style={[
                    shared.checkbox,
                    done ? shared.checkboxDone : { borderColor: PRIORITY_COLOR[t.priority] },
                  ]}
                >
                  {done && <Text style={shared.checkmark}>✓</Text>}
                </View>
              </Pressable>
              <Pressable
                style={shared.cardBody}
                onPress={() => setEditingTask(t)}
                accessibilityRole="button"
                accessibilityLabel={tr('common.editA11y', { title: t.title })}
              >
                <Text style={[shared.cardTitle, done && shared.cardTitleDone]}>{t.title}</Text>
                {((t.due_date && !done) || subtaskCounts[t.id] || t.recurrence) && (
                  <Text style={styles.due}>
                    {[
                      t.recurrence
                        ? `🔁 ${scheduleLabel(t.recurrence, schedLabels)}`
                        : null,
                      t.due_date && !done ? shortDate(t.due_date, lang) : null,
                      subtaskCounts[t.id]
                        ? `${subtaskCounts[t.id].done}/${subtaskCounts[t.id].total} ${tr('task.subtaskCountSuffix', { n: subtaskCounts[t.id].total })}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join('  ·  ')}
                  </Text>
                )}
              </Pressable>
              {!done && <PriorityMark priority={t.priority} />}
            </View>
          </SwipeableRow>
        </Animated.View>
      );
    },
    // Rows must re-render when openRowId/subtaskCounts change, so they stay in
    // the dependency list (together with FlatList's extraData).
    [openRowId, subtaskCounts, schedLabels, styles, shared, lang, tr]
  );

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <FlatList
        data={tasks}
        renderItem={renderItem}
        keyExtractor={(t) => t.id}
        // Row appearance also depends on state outside the list (an open swipe,
        // subtask badges) — FlatList doesn't know about these, so we declare them explicitly.
        extraData={`${openRowId}|${tasks.length}`}
        contentContainerStyle={shared.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <View style={shared.headerRow}>
              <Text style={shared.greeting}>{tr('tabs.tasks')}</Text>
              <ProfileButton />
            </View>
            <Text style={shared.subtitle}>{tr('screen.tasksSubtitle', { n: remaining })}</Text>
          </>
        }
        ListEmptyComponent={
          <EmptyState emoji="📝" title={tr('empty.tasksTitle')} subtitle={tr('empty.tasksBody')} />
        }
        ListFooterComponent={
          // If older completed tasks are hidden, they can be revealed with one
          // tap. The button only shows up when something is genuinely hidden —
          // it never promises an empty result.
          olderCompletedCount > 0 ? (
            <Pressable
              style={styles.showOlderBtn}
              onPress={() => setShowAllCompleted(true)}
              accessibilityRole="button"
              accessibilityLabel={tr('tasks.showOlderCompleted', { n: olderCompletedCount })}
            >
              <Text style={styles.showOlderText}>
                {tr('tasks.showOlderCompleted', { n: olderCompletedCount })}
              </Text>
            </Pressable>
          ) : null
        }
      />

      <TaskEditModal task={editingTask} onClose={() => setEditingTask(null)} onChanged={reload} />
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    due: { fontSize: 12, color: c.muted, marginTop: 3 },
    rowSpacing: { marginBottom: 8 },
    noMargin: { marginBottom: 0 },
    showOlderBtn: { alignItems: 'center', paddingVertical: 16, marginTop: 4 },
    showOlderText: { fontSize: 14, fontWeight: '600', color: c.primary },
  });
