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
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { subtaskRepo, taskRepo } from '@/db';
import type { Task } from '@/db';
import { buildScheduleLabels, extractTime, scheduleLabel, todayDate, toYmd } from '@/lib/helpers';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { matchesWords, queryWords } from '@/lib/search';
import { cancelTaskReminders, refreshTaskReminders, rescheduleEverything } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';
import { EmptyState } from '@/ui/EmptyState';
import { UndoSnackbar, useUndoNotice } from '@/ui/UndoSnackbar';
import { SearchBox } from '@/ui/SearchBox';
import { PriorityMark } from '@/ui/PriorityMark';
import { HeaderActions } from '@/ui/HeaderActions';
import { FeatureGuide } from '@/ui/guide/FeatureGuide';
import { useFeatureGuide } from '@/ui/guide/useFeatureGuide';
import { MetaLine } from '@/ui/MetaLine';
import { usePullRefresh } from '@/ui/usePullRefresh';
import { SwipeableRow } from '@/ui/SwipeableRow';
import { bulkComplete, bulkDelete, bulkPostpone, type BulkResult } from '@/ui/taskBulk';
import { toggleSharedTaskOptimistic, useFriendNames, useSharedTasksFreshness } from '@/ui/sharedTaskUi';
import { SharedTaskModal } from '@/ui/SharedTaskModal';
import { TaskEditModal } from '@/ui/TaskEditModal';
import { TimeBadge } from '@/ui/TimeBadge';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { PRIORITY_COLOR, shortDate, type Colors } from '@/ui/theme';

// The search field only appears once the list is long enough to need it.
const SEARCH_MIN_TASKS = 8;

// Default visibility window for completed tasks. Long enough to answer "what
// did I do yesterday", short enough not to turn the list into an archive.
const COMPLETED_WINDOW_DAYS = 30;

function shiftDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

// The list mixes task rows with ONE divider row ("Completed (N)") that
// toggles the completed section — a single FlatList keeps virtualization.
type Row = { kind: 'task'; task: Task } | { kind: 'divider'; count: number };

export default function TasksScreen() {
  const { colors, shared } = useTheme();
  // Note: i18n's `t` is aliased to `tr` so it doesn't clash with the `t` (task) map variable below.
  const { t: tr, lang } = useI18n();
  const styles = makeStyles(colors);
  const { user, dataVersion, authUser } = useAppData();
  const guide = useFeatureGuide('tasks');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  // A task shared WITH me that has subtasks: opens a window to tick them.
  const [viewingShared, setViewingShared] = useState<Task | null>(null);
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
  // The completed section starts collapsed so finished work doesn't push
  // pending tasks off screen; the header row shows how many are hidden.
  const [completedOpen, setCompletedOpen] = useState(false);
  // Search narrows the list by title; while searching, finished tasks that
  // match are listed too (searching for something you did is normal).
  const [query, setQuery] = useState('');
  // SELECTION MODE: long-press a task to start; null = off. Tapping rows then
  // toggles them and a bar at the bottom acts on all of them at once.
  const [selected, setSelected] = useState<Set<string> | null>(null);

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
  useSharedTasksFreshness(reload);
  const { refreshing, onRefresh } = usePullRefresh(reload);
  const friendNames = useFriendNames(tasks.map((t) => t.shared_owner_uid ?? t.shared_with_id));

  const remaining = useMemo(() => tasks.filter((t) => t.completed_at === null).length, [tasks]);

  const words = useMemo(() => queryWords(query, lang), [query, lang]);
  const searching = words.length > 0;
  // A search that's been typed stays visible even if the list later shrinks below the threshold.
  const showSearch = tasks.length >= SEARCH_MIN_TASKS || query.length > 0;

  const rows = useMemo<Row[]>(() => {
    const visible = searching ? tasks.filter((t) => matchesWords(t.title, words, lang)) : tasks;
    const pending = visible.filter((t) => t.completed_at === null);
    const completed = visible.filter((t) => t.completed_at !== null);
    const out: Row[] = pending.map((task) => ({ kind: 'task', task }));
    if (searching) {
      completed.forEach((task) => out.push({ kind: 'task', task }));
      return out;
    }
    const completedCount = completed.length + olderCompletedCount;
    if (completedCount > 0) {
      out.push({ kind: 'divider', count: completedCount });
      if (completedOpen) completed.forEach((task) => out.push({ kind: 'task', task }));
    }
    return out;
  }, [tasks, olderCompletedCount, completedOpen, searching, words, lang]);

  // Label set for the recurring-task badge ("🔁 Every day / Mon·Wed·Fri /
  // Every year: ...") — see helpers.buildScheduleLabels.
  const schedLabels = buildScheduleLabels(tr, (md) => shortDate(`2000-${md}`, lang));

  const sharedLabel = (t: Task): string | null => {
    const uid = t.shared_owner_uid ?? t.shared_with_id;
    return uid ? (friendNames.get(uid) ?? tr('friends.unknownName')) : null;
  };

  // A task shared WITH me: read-only except the check-off and its subtasks'
  // check-offs (see sharedTaskUi).
  const selecting = selected !== null;
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size === 0 ? null : next;
    });
  const selectedTasks = () => tasks.filter((t) => selected?.has(t.id));

  const openTask = (t: Task) => {
    if (selecting) {
      if (!t.shared_owner_uid) toggleSelected(t.id);
      return;
    }
    if (t.shared_owner_uid) {
      if (subtaskRepo.countForTask(t.id).total > 0) {
        setViewingShared(t);
        return;
      }
      Alert.alert(t.title, tr('share.readOnlyTask', { name: friendNames.get(t.shared_owner_uid) ?? tr('friends.unknownName') }));
      return;
    }
    setEditingTask(t);
  };

  const toggleTask = (t: Task) => {
    if (selecting) {
      if (!t.shared_owner_uid) toggleSelected(t.id);
      return;
    }
    if (t.shared_owner_uid) {
      toggleSharedTaskOptimistic(t, reload, tr);
      return;
    }
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

  const undo = useUndoNotice();

  const removeTask = (t: Task) => {
    taskRepo.softDelete(t.id);
    undo.show({
      text: tr('undo.deleted', { title: t.title }),
      onUndo: () => {
        taskRepo.restore(t.id);
        rescheduleEverything(user.id).catch(() => {});
        reload();
      },
    });
    cancelTaskReminders(t.id).catch((e) =>
      console.warn('[Notification] Failed to cancel reminders for deleted task:', e)
    );
    reload();
  };

  // Runs one bulk action, leaves selection mode and offers one Undo for the lot.
  const finishBulk = (result: BulkResult, key: 'undo.bulkCompleted' | 'undo.bulkMoved' | 'undo.bulkDeleted') => {
    setSelected(null);
    if (result.count > 0) {
      undo.show({
        text: tr(key, { n: result.count }),
        onUndo: () => {
          result.undo();
          reload();
        },
      });
    }
    reload();
  };
  const bulkDone = () => {
    const r = bulkComplete(selectedTasks());
    if (r.count > 0) notifySuccess();
    finishBulk(r, 'undo.bulkCompleted');
  };
  const bulkTomorrow = () => finishBulk(bulkPostpone(selectedTasks(), todayDate()), 'undo.bulkMoved');
  const bulkRemove = () => {
    const list = selectedTasks().filter((t) => !t.shared_owner_uid);
    Alert.alert(tr('tasks.bulkDeleteConfirm', { n: list.length }), undefined, [
      { text: tr('common.cancel'), style: 'cancel' },
      { text: tr('common.delete'), style: 'destructive', onPress: () => finishBulk(bulkDelete(list, user.id), 'undo.bulkDeleted') },
    ]);
  };

  // Swipe edit/delete only on my own tasks; a task shared WITH me can't be
  // edited or deleted here (only the owner can).
  const wrapRow = (t: Task, card: JSX.Element) =>
    t.shared_owner_uid || selecting ? (
      card
    ) : (
      <SwipeableRow
        isOpen={openRowId === t.id}
        onOpenChange={(open) => setOpenRowId(open ? t.id : null)}
        onEdit={() => setEditingTask(t)}
        onDelete={() => removeTask(t)}
        editA11yLabel={tr('common.editA11y', { title: t.title })}
        deleteA11yLabel={tr('common.deleteA11y', { title: t.title })}
      >
        {card}
      </SwipeableRow>
    );

  const renderItem = useCallback(
    ({ item: row, index: i }: { item: Row; index: number }) => {
      if (row.kind === 'divider') {
        return (
          <Pressable
            style={[styles.sectionHeader, i === 0 && { marginTop: 20 }]}
            onPress={() => setCompletedOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: completedOpen }}
            accessibilityLabel={tr('tasks.completedSection', { n: row.count })}
          >
            <Text style={styles.sectionHeaderText}>
              {tr('tasks.completedSection', { n: row.count })}
            </Text>
            <Feather
              name={completedOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.faint}
            />
          </Pressable>
        );
      }
      const t = row.task;
      const done = t.completed_at !== null;
      const time = extractTime(t.due_date);
      // Past-due and still open → the date is shown in the danger color.
      const overdue = !done && !!t.due_date && t.due_date.slice(0, 10) < todayDate();
      return (
        <Animated.View
          layout={LinearTransition.duration(260)}
          style={[styles.rowSpacing, i === 0 && { marginTop: 20 }]}
        >
          {/* marginBottom removed (0) — shared.card's bottom spacing now
              lives on the outer wrapper (rowSpacing); otherwise the card's
              own unpainted margin would let the action panel's color bleed
              through as a thin strip right under the card. */}
          {wrapRow(t, (
            <View style={[shared.card, styles.noMargin, selected?.has(t.id) && styles.selectedCard]}>
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
                onPress={() => openTask(t)}
                onLongPress={() => {
                  if (selecting || t.shared_owner_uid) return;
                  tapLight();
                  setSelected(new Set([t.id]));
                }}
                accessibilityRole="button"
                accessibilityState={selecting ? { selected: !!selected?.has(t.id) } : undefined}
                accessibilityLabel={selecting ? tr('tasks.bulkSelectA11y', { title: t.title }) : tr('common.editA11y', { title: t.title })}
              >
                <Text style={[shared.cardTitle, done && shared.cardTitleDone]}>{t.title}</Text>
                <MetaLine
                  items={[
                    sharedLabel(t) ? { text: sharedLabel(t)!, icon: 'users' } : null,
                    t.recurrence
                      ? { text: scheduleLabel(t.recurrence, schedLabels), icon: 'repeat' }
                      : null,
                    t.due_date && !done
                      ? { text: shortDate(t.due_date, lang), icon: 'calendar', danger: overdue }
                      : null,
                    subtaskCounts[t.id]
                      ? {
                          text: `${subtaskCounts[t.id].done}/${subtaskCounts[t.id].total} ${tr('task.subtaskCountSuffix', { n: subtaskCounts[t.id].total })}`,
                        }
                      : null,
                  ]}
                />
              </Pressable>
              {time && !done && <TimeBadge time={time} endTime={t.end_time} />}
              {!done && <PriorityMark priority={t.priority} />}
            </View>
          ))}
        </Animated.View>
      );
    },
    // Rows must re-render when openRowId/subtaskCounts change, so they stay in
    // the dependency list (together with FlatList's extraData).
    [openRowId, subtaskCounts, schedLabels, styles, shared, lang, tr, friendNames, completedOpen, colors, selected, tasks]
  );

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <FlatList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(r) => (r.kind === 'divider' ? 'completed-divider' : r.task.id)}
        // Row appearance also depends on state outside the list (an open swipe,
        // subtask badges) — FlatList doesn't know about these, so we declare them explicitly.
        extraData={`${openRowId}|${tasks.length}|${completedOpen}|${query}|${selected ? [...selected].join(',') : ''}`}
        contentContainerStyle={shared.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.card}
          />
        }
        ListHeaderComponent={
          <>
            <View style={shared.headerRow}>
              <Text style={shared.greeting}>{tr('tabs.tasks')}</Text>
              <HeaderActions onHelp={guide.open} />
            </View>
            <Text style={shared.subtitle}>{tr('screen.tasksSubtitle', { n: remaining })}</Text>
            {showSearch && (
              <SearchBox
                value={query}
                onChange={setQuery}
                placeholder={tr('tasks.searchPlaceholder')}
                clearLabel={tr('tasks.searchClear')}
              />
            )}
          </>
        }
        ListEmptyComponent={
          searching ? (
            <EmptyState emoji="🔍" title={tr('tasks.searchEmpty')} />
          ) : (
            <EmptyState emoji="📝" title={tr('empty.tasksTitle')} subtitle={tr('empty.tasksBody')} />
          )
        }
        ListFooterComponent={
          // If older completed tasks are hidden, they can be revealed with one
          // tap. The button only shows up when something is genuinely hidden —
          // it never promises an empty result.
          !searching && completedOpen && olderCompletedCount > 0 ? (
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
      <SharedTaskModal
        task={viewingShared}
        ownerName={(viewingShared?.shared_owner_uid && friendNames.get(viewingShared.shared_owner_uid)) || tr('friends.unknownName')}
        onClose={() => setViewingShared(null)}
        onChanged={reload}
      />
      {selected && (
        <View style={styles.bulkBar}>
          <Pressable
            onPress={() => setSelected(null)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={tr('tasks.bulkCancelA11y')}
          >
            <Feather name="x" size={20} color={colors.muted} />
          </Pressable>
          <Text style={styles.bulkCount}>{tr('tasks.selectedCount', { n: selected.size })}</Text>
          <Pressable onPress={bulkDone} style={styles.bulkBtn} accessibilityRole="button">
            <Text style={styles.bulkBtnText}>{tr('tasks.bulkComplete')}</Text>
          </Pressable>
          <Pressable onPress={bulkTomorrow} style={styles.bulkBtn} accessibilityRole="button">
            <Text style={styles.bulkBtnText}>{tr('tasks.bulkTomorrow')}</Text>
          </Pressable>
          <Pressable onPress={bulkRemove} style={styles.bulkBtn} accessibilityRole="button">
            <Text style={[styles.bulkBtnText, { color: colors.danger }]}>{tr('tasks.bulkDelete')}</Text>
          </Pressable>
        </View>
      )}
      <UndoSnackbar notice={undo.notice} onDone={undo.dismiss} />
      <FeatureGuide
        guide="tasks"
        visible={guide.visible}
        onClose={guide.close}
        canShare={!!authUser && !authUser.isAnonymous}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 4,
      marginBottom: 4,
    },
    sectionHeaderText: { fontSize: 13, fontWeight: '700', color: c.muted },
    rowSpacing: { marginBottom: 8 },
    noMargin: { marginBottom: 0 },
    selectedCard: { borderColor: c.primary, borderWidth: 2 },
    bulkBar: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 16,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      elevation: 6,
    },
    bulkCount: { flex: 1, fontSize: 14, fontWeight: '700', color: c.text },
    bulkBtn: { paddingHorizontal: 8, paddingVertical: 8 },
    bulkBtnText: { fontSize: 14, fontWeight: '700', color: c.primary },
    showOlderBtn: { alignItems: 'center', paddingVertical: 16, marginTop: 4 },
    showOlderText: { fontSize: 14, fontWeight: '600', color: c.primary },
  });
