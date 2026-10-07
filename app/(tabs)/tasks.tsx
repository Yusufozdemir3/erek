// Tasks tab: every open task (future and dated ones too), finished ones in a
// collapsed section at the bottom. Tap to edit, swipe for edit/delete,
// long-press to select several. Adding happens from the ＋ menu.
//
// A FlatList mounts only visible rows, and the query returns only recently
// finished tasks (taskRepo.listForScreen) — a year of tasks stays fast.

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

// Finished tasks listed by default; older ones are one tap away.
const COMPLETED_WINDOW_DAYS = 30;

function shiftDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

// Task rows plus one "Completed (N)" divider, in a single FlatList.
type Row = { kind: 'task'; task: Task } | { kind: 'divider'; count: number };

export default function TasksScreen() {
  const { colors, shared } = useTheme();
  // `tr`, since `t` names tasks below.
  const { t: tr, lang } = useI18n();
  const styles = makeStyles(colors);
  const { user, dataVersion, authUser } = useAppData();
  const guide = useFeatureGuide('tasks');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  // A task shared WITH me with subtasks opens this to tick them.
  const [viewingShared, setViewingShared] = useState<Task | null>(null);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [subtaskCounts, setSubtaskCounts] = useState<
    Record<string, { done: number; total: number }>
  >({});
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const [olderCompletedCount, setOlderCompletedCount] = useState(0);
  const [completedOpen, setCompletedOpen] = useState(false);
  // A search also lists matching finished tasks.
  const [query, setQuery] = useState('');
  // Selection mode (long press); null = off.
  const [selected, setSelected] = useState<Set<string> | null>(null);

  const reload = useCallback(() => {
    const since = showAllCompleted ? null : shiftDays(todayDate(), -COMPLETED_WINDOW_DAYS);
    const list = taskRepo.listForScreen(user.id, since);
    setTasks(list);
    setOlderCompletedCount(since ? taskRepo.countCompletedBefore(user.id, since) : 0);
    setSubtaskCounts(subtaskRepo.countsForTasks(list.map((t) => t.id)));
  }, [user.id, dataVersion, showAllCompleted]);

  useFocusEffect(reload);
  useSharedTasksFreshness(reload);
  const { refreshing, onRefresh } = usePullRefresh(reload);
  const friendNames = useFriendNames(tasks.map((t) => t.shared_owner_uid ?? t.shared_with_id));

  const remaining = useMemo(() => tasks.filter((t) => t.completed_at === null).length, [tasks]);

  const words = useMemo(() => queryWords(query, lang), [query, lang]);
  const searching = words.length > 0;
  // A typed search stays visible even if the list shrinks.
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

  const schedLabels = buildScheduleLabels(tr, (md) => shortDate(`2000-${md}`, lang));

  const sharedLabel = (t: Task): string | null => {
    const uid = t.shared_owner_uid ?? t.shared_with_id;
    return uid ? (friendNames.get(uid) ?? tr('friends.unknownName')) : null;
  };

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
    // A recurring task may have moved instead of completing.
    refreshTaskReminders(t.id);
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

  // Swipe actions only on my own tasks.
  const wrapRow = (t: Task, card: React.JSX.Element) =>
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
      const overdue = !done && !!t.due_date && t.due_date.slice(0, 10) < todayDate();
      return (
        <Animated.View
          layout={LinearTransition.duration(260)}
          style={[styles.rowSpacing, i === 0 && { marginTop: 20 }]}
        >
          {/* Spacing lives on the wrapper (rowSpacing): a card margin would show
              the swipe panel's color as a strip under the card. */}
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
    [openRowId, subtaskCounts, schedLabels, styles, shared, lang, tr, friendNames, completedOpen, colors, selected, tasks]
  );

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <FlatList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(r) => (r.kind === 'divider' ? 'completed-divider' : r.task.id)}
        // Rows also depend on state FlatList can't see.
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
            <EmptyState icon="search" title={tr('tasks.searchEmpty')} />
          ) : (
            <EmptyState icon="edit" title={tr('empty.tasksTitle')} subtitle={tr('empty.tasksBody')} />
          )
        }
        ListFooterComponent={
          // Only when older finished tasks are really hidden.
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
