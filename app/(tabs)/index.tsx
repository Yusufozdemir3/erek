// Today tab: the day's tasks and scheduled habits in one list, to check off.
// The week strip and the date (→ calendar) move to other days; adding happens
// from the ＋ menu.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { requestAdd } from '@/lib/addRequest';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { habitRepo, subtaskRepo, taskRepo } from '@/db';
import type { Task } from '@/db';
import { buildScheduleLabels, extractTime, scheduleLabel, toYmd, todayDate } from '@/lib/helpers';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { highestMilestone } from '@/lib/milestones';
import { refreshTaskReminders } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';
import { refreshWidget } from '@/widget/widgetData';
import { useTodayData, type HabitView, type SkippedHabitView } from '@/ui/useTodayData';
import { ReviewCard } from '@/ui/ReviewCard';
import { loadReview } from '@/ui/reviewData';
import { isReviewDay } from '@/lib/weeklyReview';
import { SharedTaskModal } from '@/ui/SharedTaskModal';
import { TaskEditModal } from '@/ui/TaskEditModal';
import { DatePickerModal } from '@/ui/DatePickerModal';
import { WeekStrip } from '@/ui/WeekStrip';
import { promptUnlinkGoalIfCompleted } from '@/ui/goalCompletionPrompt';
import { toggleSharedTaskOptimistic, useFriendNames, useSharedTasksFreshness } from '@/ui/sharedTaskUi';
import { DailySummary } from '@/ui/DailySummary';
import { EmptyState } from '@/ui/EmptyState';
import { HabitToggle } from '@/ui/HabitToggle';
import { HabitTimer } from '@/ui/HabitTimer';
import { AmountStepper } from '@/ui/AmountStepper';
import { PriorityMark } from '@/ui/PriorityMark';
import { HeaderActions } from '@/ui/HeaderActions';
import { FeatureGuide } from '@/ui/guide/FeatureGuide';
import { useFeatureGuide } from '@/ui/guide/useFeatureGuide';
import { Confetti } from '@/ui/Confetti';
import { MetaLine } from '@/ui/MetaLine';
import { StreakBadge } from '@/ui/StreakBadge';
import { usePullRefresh } from '@/ui/usePullRefresh';
import { TimeBadge } from '@/ui/TimeBadge';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Lang } from '@/i18n/translations';
import { DATE_LOCALE, fullDateLabel, PRIORITY_COLOR, shortDate, type Colors } from '@/ui/theme';

// Cards re-sort as they complete; this animates the move.
const LIST_LAYOUT = LinearTransition.duration(260);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// "Today", or the weekday's name.
function titleFor(ymd: string, today: string, lang: Lang, todayLabel: string): string {
  if (ymd === today) return todayLabel;
  const locale = DATE_LOCALE[lang];
  const w = new Date(`${ymd}T00:00:00`).toLocaleDateString(locale, { weekday: 'long' });
  return w.charAt(0).toLocaleUpperCase(locale) + w.slice(1);
}

type TypeFilter = 'all' | 'task' | 'habit';

export default function TodayScreen() {
  const { colors, shared } = useTheme();
  // `tr`, since `t` names tasks below.
  const { t: tr, lang } = useI18n();
  const styles = makeStyles(colors);
  // Shared so the ＋ menu can default a new task to the viewed day.
  const { user, selectedDate, setSelectedDate } = useAppData();
  const guide = useFeatureGuide('today');
  const today = todayDate();

  const [showPicker, setShowPicker] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  // A task shared WITH me with subtasks opens this to tick them.
  const [viewingShared, setViewingShared] = useState<Task | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [completedOpen, setCompletedOpen] = useState(false);
  // Confetti: bumping the id plays one burst.
  const [burstId, setBurstId] = useState(0);

  const { tasks, habits, skippedHabits, subtaskCounts, weekProgress, reload } = useTodayData(user.id, selectedDate, today);
  const friendNames = useFriendNames(tasks.map((t) => t.shared_owner_uid ?? t.shared_with_id));
  useSharedTasksFreshness(reload);
  const { refreshing, onRefresh } = usePullRefresh(reload);

  // The filter narrows only the list; the summary and "empty day" use everything.
  const showTasks = typeFilter !== 'habit';
  const showHabits = typeFilter !== 'task';
  const filteredTasks = showTasks ? tasks : [];
  const filteredHabits = showHabits ? habits : [];
  // Only plain habits fold away when done; counters and timers can go on.
  const isFoldable = (h: HabitView) => h.completed && h.kind !== 'timer' && h.target == null;
  const openTasks = filteredTasks.filter((t) => t.completed_at === null);
  const doneTasks = filteredTasks.filter((t) => t.completed_at !== null);
  const openHabits = filteredHabits.filter((h) => !isFoldable(h));
  const doneHabits = filteredHabits.filter(isFoldable);
  const doneCount = doneTasks.length + doneHabits.length;
  const dayIsEmpty = tasks.length === 0 && habits.length === 0 && skippedHabits.length === 0;
  const filterHidesEverything =
    !dayIsEmpty && filteredTasks.length === 0 && filteredHabits.length === 0;

  const isToday = selectedDate === today;
  // A future day can't be checked off.
  const isFuture = selectedDate > today;

  const habitsDone = habits.filter((h) => h.completed).length;
  const tasksDone = tasks.filter((t) => t.completed_at !== null).length;

  // Confetti when the day becomes complete or a habit earns a badge — armed by
  // the user's own check-off, judged when the reloaded data arrives.
  const medalDays = (h: HabitView) => (h.weekQuota ? h.streak * 7 : h.streak);
  const dayFullyDone = () =>
    tasks.length + habits.length > 0 &&
    tasks.every((t) => t.completed_at !== null) &&
    habits.every((h) => h.completed);
  const armed = useRef<{ habitId: string | null; prevMedal: number; wasAllDone: boolean } | null>(null);
  const armCelebration = (h?: HabitView) => {
    armed.current = {
      habitId: h?.id ?? null,
      prevMedal: h ? highestMilestone(medalDays(h))?.days ?? 0 : 0,
      wasAllDone: dayFullyDone(),
    };
  };
  useEffect(() => {
    const a = armed.current;
    if (!a) return;
    armed.current = null;
    if (!isToday) return;
    const newDay = !a.wasAllDone && dayFullyDone();
    const h = a.habitId ? habits.find((x) => x.id === a.habitId) : undefined;
    const newMedal = !!h && (highestMilestone(medalDays(h))?.days ?? 0) > a.prevMedal;
    if (newDay || newMedal) setBurstId((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, habits]);

  const schedLabels = buildScheduleLabels(tr, (md) => shortDate(`2000-${md}`, lang));

  const sharedLabel = (t: Task): string | null => {
    const uid = t.shared_owner_uid ?? t.shared_with_id;
    return uid ? (friendNames.get(uid) ?? tr('friends.unknownName')) : null;
  };

  const openTask = (t: Task) => {
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
    if (t.shared_owner_uid) {
      toggleSharedTaskOptimistic(t, reload, tr);
      return;
    }
    const completing = t.completed_at === null;
    if (completing) armCelebration();
    taskRepo.setCompleted(t.id, completing);
    completing ? notifySuccess() : tapLight();
    // A recurring task may have moved instead of completing.
    refreshTaskReminders(t.id);
    reload();
  };

  const toggleHabit = (h: HabitView) => {
    if (isFuture) return;
    const completing = !h.completed;
    if (completing) armCelebration(h);
    const goalDone = habitRepo.toggleLog(h.id, selectedDate, completing);
    completing ? notifySuccess() : tapLight();
    reload();
    // A local reload doesn't bump dataVersion, so refresh the widget here.
    refreshWidget(user.id);
    promptUnlinkGoalIfCompleted(h.id, goalDone, tr, reload);
  };

  const adjustHabit = (h: HabitView, delta: number) => {
    if (isFuture) return;
    if (delta > 0) armCelebration(h);
    const goalDone = habitRepo.incrementAmount(h.id, selectedDate, delta, h.target);
    tapLight();
    reload();
    refreshWidget(user.id);
    promptUnlinkGoalIfCompleted(h.id, goalDone, tr, reload);
  };

  // A typed total, applied as the difference.
  const setHabitAmount = (h: HabitView, value: number) => {
    if (isFuture) return;
    if (value > h.amount) armCelebration(h);
    const goalDone = habitRepo.incrementAmount(h.id, selectedDate, value - h.amount, h.target);
    reload();
    refreshWidget(user.id);
    promptUnlinkGoalIfCompleted(h.id, goalDone, tr, reload);
  };

  const onPickDate = (picked: Date) => setSelectedDate(toYmd(picked));

  // The review card's preview, computed on review days only; null = nothing to show.
  const reviewPreview = useMemo(
    () => {
      if (!isToday || !isReviewDay(today)) return null;
      const r = loadReview(user.id, today);
      return r.rate === null ? null : { rate: r.rate, delta: r.delta };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isToday, today, user.id, habits, tasks]
  );

  const renderTask = (t: Task) => {
    const done = t.completed_at !== null;
    const time = extractTime(t.due_date);
    return (
      <Animated.View key={t.id} layout={LIST_LAYOUT} style={shared.card}>
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
          accessibilityRole="button"
          accessibilityLabel={tr('common.editA11y', { title: t.title })}
        >
          <Text style={[shared.cardTitle, done && shared.cardTitleDone]}>{t.title}</Text>
          <MetaLine
        items={[
          sharedLabel(t) ? { text: sharedLabel(t)!, icon: 'users' } : null,
          t.recurrence ? { text: scheduleLabel(t.recurrence, schedLabels), icon: 'repeat' } : null,
          // Carried over and still open: since when, in red.
          !done && t.due_date && t.due_date.slice(0, 10) < today
            ? { text: shortDate(t.due_date, lang), icon: 'calendar', danger: true }
            : null,
          subtaskCounts[t.id]
            ? {
                text: `${subtaskCounts[t.id].done}/${subtaskCounts[t.id].total} ${tr('task.subtaskCountSuffix', { n: subtaskCounts[t.id].total })}`,
              }
            : null,
        ]}
      />
    </Pressable>
        {time && <TimeBadge time={time} endTime={t.end_time} />}
        {!done && <PriorityMark priority={t.priority} />}
      </Animated.View>
    );
  };

  const renderSkipped = (h: SkippedHabitView) => (
    <Animated.View key={`skip-${h.id}`} layout={LIST_LAYOUT} style={[shared.card, styles.doneCard]}>
      <HabitToggle icon={h.icon} color={h.color} completed={false} />
      <View style={{ flex: 1 }}>
        <Text style={shared.cardTitle}>{h.title}</Text>
        <Text style={styles.skipNote}>{tr('habit.restDay')}</Text>
      </View>
      <Pressable
        onPress={() => {
          habitRepo.setSkipped(h.id, selectedDate, false);
          tapLight();
          reload();
          refreshWidget(user.id);
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={tr('habit.restDayUndoA11y', { title: h.title })}
      >
        <Text style={styles.skipUndo}>{tr('habit.restDayUndo')}</Text>
      </Pressable>
    </Animated.View>
  );

  const renderHabit = (h: HabitView) =>
    h.kind === 'timer' ? (
      <Animated.View
        key={h.id}
        layout={LIST_LAYOUT}
        style={[shared.card, isFuture && styles.futureCard, h.completed && styles.doneCard]}
      >
        <HabitToggle icon={h.icon} color={h.color} completed={h.completed} />
        <Text style={[shared.cardTitle, h.completed && shared.cardTitleDone]}>
          {h.title}
        </Text>
        <HabitTimer
          habitId={h.id}
          amount={h.amount}
          target={h.target ?? 0}
          editable={isToday}
          onSet={(v) => setHabitAmount(h, v)}
        />
      </Animated.View>
    ) : h.target != null ? (
      <Animated.View
        key={h.id}
        layout={LIST_LAYOUT}
        style={[shared.card, isFuture && styles.futureCard, h.completed && styles.doneCard]}
      >
        <HabitToggle icon={h.icon} color={h.color} completed={h.completed} />
        <Text style={[shared.cardTitle, h.completed && shared.cardTitleDone]}>
          {h.title}
        </Text>
        <AmountStepper
          amount={h.amount}
          target={h.target}
          unit={h.unit}
          onDec={() => adjustHabit(h, -1)}
          onInc={() => adjustHabit(h, 1)}
          onSet={(v) => setHabitAmount(h, v)}
          disabled={isFuture}
        />
      </Animated.View>
    ) : (
      <AnimatedPressable
        key={h.id}
        layout={LIST_LAYOUT}
        style={[shared.card, isFuture && styles.futureCard, h.completed && styles.doneCard]}
        onPress={() => toggleHabit(h)}
        disabled={isFuture}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: h.completed, disabled: isFuture }}
        accessibilityLabel={tr('habit.checkboxA11y', { title: h.title })}
      >
        <HabitToggle icon={h.icon} color={h.color} completed={h.completed} />
        <Text style={[shared.cardTitle, h.completed && shared.cardTitleDone]}>
          {h.title}
        </Text>
        {/* Quota habits: the week's "2/3"; their streak is in weeks. */}
        {h.weekQuota && (
          <Text style={styles.quotaChip}>
            {h.weekQuota.done}/{h.weekQuota.target}
          </Text>
        )}
        {h.streak > 0 && (
          <StreakBadge streak={h.streak} medalDays={medalDays(h)} />
        )}
      </AnimatedPressable>
    );

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={shared.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.card}
          />
        }
      >
        <View style={styles.headRow}>
          <Text style={shared.greeting}>{titleFor(selectedDate, today, lang, tr('tabs.today'))}</Text>
          <View style={styles.headRight}>
            {!isToday && (
              <Pressable onPress={() => setSelectedDate(today)} hitSlop={8}>
                <Text style={styles.backToday}>{tr('today.backToday')}</Text>
              </Pressable>
            )}
            <HeaderActions onHelp={guide.open} />
          </View>
        </View>

        <Pressable onPress={() => setShowPicker(true)} hitSlop={6}>
          <Text style={[shared.subtitle, styles.dateLink, { textTransform: 'capitalize' }]}>
            {fullDateLabel(selectedDate, lang)}
          </Text>
        </Pressable>

        <WeekStrip
          selectedDate={selectedDate}
          today={today}
          lang={lang}
          colors={colors}
          progress={weekProgress}
          onSelect={setSelectedDate}
        />

        <DatePickerModal
          visible={showPicker}
          value={new Date(`${selectedDate}T00:00:00`)}
          onClose={() => setShowPicker(false)}
          onConfirm={onPickDate}
        />

        {isToday && (
          <DailySummary
            habitsDone={habitsDone}
            habitsTotal={habits.length}
            tasksDone={tasksDone}
            tasksTotal={tasks.length}
          />
        )}

        {isToday && <ReviewCard today={today} preview={reviewPreview} />}

        {!dayIsEmpty && (
          <View style={styles.filterRow}>
            {(['all', 'task', 'habit'] as const).map((f) => {
              const active = typeFilter === f;
              const label =
                f === 'all' ? tr('today.filterAll') : f === 'task' ? tr('tabs.tasks') : tr('tabs.habits');
              return (
                <Pressable
                  key={f}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setTypeFilter(f)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.list}>
          {dayIsEmpty ? (
            <>
              <EmptyState
                icon={isToday ? 'celebrate' : 'moon'}
                title={isToday ? tr('empty.todayTitle') : tr('empty.otherDayTitle')}
                subtitle={isToday ? tr('empty.todayBody') : undefined}
              />
              {/* Only on an empty day; otherwise the ＋ button is always at hand. */}
              {isToday && (
                <Pressable
                  style={styles.addRow}
                  onPress={() => requestAdd('menu')}
                  accessibilityRole="button"
                  accessibilityLabel={tr('today.addRow')}
                >
                  <Feather name="plus" size={18} color={colors.primary} />
                  <Text style={styles.addRowText}>{tr('today.addRow')}</Text>
                </Pressable>
              )}
            </>
          ) : filterHidesEverything ? (
            <EmptyState icon="search" title={tr('today.filterEmpty')} />
          ) : (
            <>
              {openTasks.map(renderTask)}
              {openHabits.map(renderHabit)}
              {doneCount > 0 && (
                <Pressable
                  style={styles.sectionHeader}
                  onPress={() => setCompletedOpen((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: completedOpen }}
                  accessibilityLabel={tr('tasks.completedSection', { n: doneCount })}
                >
                  <Text style={styles.sectionHeaderText}>
                    {tr('tasks.completedSection', { n: doneCount })}
                  </Text>
                  <Feather
                    name={completedOpen ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.faint}
                  />
                </Pressable>
              )}
              {completedOpen && doneTasks.map(renderTask)}
              {completedOpen && doneHabits.map(renderHabit)}
              {skippedHabits.map(renderSkipped)}
            </>
          )}
        </View>
      </ScrollView>

      <Confetti burstId={burstId} />
      <FeatureGuide guide="today" visible={guide.visible} onClose={guide.close} />

      <TaskEditModal task={editingTask} onClose={() => setEditingTask(null)} onChanged={reload} />
      <SharedTaskModal
        task={viewingShared}
        ownerName={(viewingShared?.shared_owner_uid && friendNames.get(viewingShared.shared_owner_uid)) || tr('friends.unknownName')}
        onClose={() => setViewingShared(null)}
        onChanged={reload}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    backToday: { fontSize: 14, fontWeight: '700', color: c.primary },
    futureCard: { opacity: 0.5 },
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 12,
      paddingVertical: 16,
      borderRadius: 14,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: c.border,
    },
    addRowText: { fontSize: 14, fontWeight: '600', color: c.primary },
    skipNote: { fontSize: 12, color: c.muted, marginTop: 2 },
    skipUndo: { fontSize: 13, fontWeight: '700', color: c.primary, paddingVertical: 8 },
    doneCard: { opacity: 0.6 },
    dateLink: { color: c.primary, fontWeight: '600' },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    filterChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    filterChipText: { fontSize: 13, fontWeight: '600', color: c.muted },
    filterChipTextActive: { color: c.onAccent },
    list: { marginTop: 16 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 4,
      marginBottom: 4,
    },
    sectionHeaderText: { fontSize: 13, fontWeight: '700', color: c.muted },
    quotaChip: {
      fontSize: 13,
      fontWeight: '800',
      color: c.primary,
      backgroundColor: c.primarySoft,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
      marginRight: 8,
      overflow: 'hidden',
    },
  });
