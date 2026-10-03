// "Today" tab — the daily summary screen.
// Two sections stacked: (1) tasks due that day, (2) daily habits + streak.
// No adding here; task/habit adding lives on their own tabs. This screen is
// only for viewing/checking off.
// Tapping the date opens the calendar; you can jump to another day and check it off.
// Architecture rule: no SQL; only taskRepo / habitRepo are called.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { habitRepo, reminderRepo, subtaskRepo, taskRepo } from '@/db';
import type { Task } from '@/db';
import { buildScheduleLabels, extractTime, scheduleLabel, toYmd, todayDate } from '@/lib/helpers';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { highestMilestone } from '@/lib/milestones';
import { refreshTaskReminders } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';
import { refreshWidget } from '@/widget/widgetData';
import { useTodayData, type HabitView } from '@/ui/useTodayData';
import { VoiceCommandBar, type CommandNotice } from '@/ui/VoiceCommandBar';
import { ReviewCard } from '@/ui/ReviewCard';
import { loadReview } from '@/ui/reviewData';
import { parseVoiceCommand, type Target } from '@/lib/voiceCommand';
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
import { Confetti } from '@/ui/Confetti';
import { MetaLine } from '@/ui/MetaLine';
import { StreakBadge } from '@/ui/StreakBadge';
import { usePullRefresh } from '@/ui/usePullRefresh';
import { TimeBadge } from '@/ui/TimeBadge';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Lang } from '@/i18n/translations';
import { DATE_LOCALE, fullDateLabel, PRIORITY_COLOR, shortDate, type Colors } from '@/ui/theme';

// List cards re-sort once completed (completed items sink to the bottom); each
// card is wrapped in this layout transition so the position change animates smoothly.
const LIST_LAYOUT = LinearTransition.duration(260);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Title: "Today" (translated) if it's today, otherwise that day's name (e.g. "Monday").
function titleFor(ymd: string, today: string, lang: Lang, todayLabel: string): string {
  if (ymd === today) return todayLabel;
  const locale = DATE_LOCALE[lang];
  const w = new Date(`${ymd}T00:00:00`).toLocaleDateString(locale, { weekday: 'long' });
  return w.charAt(0).toLocaleUpperCase(locale) + w.slice(1);
}

type TypeFilter = 'all' | 'task' | 'habit';

export default function TodayScreen() {
  const { colors, shared } = useTheme();
  // Note: i18n's `t` is aliased to `tr` so it doesn't clash with the `t` (task) map variable.
  const { t: tr, lang } = useI18n();
  const styles = makeStyles(colors);
  // selectedDate is shared (AppData): the central ＋ menu reads it from here to
  // add a new task with the viewed day as its default date.
  const { user, selectedDate, setSelectedDate } = useAppData();
  const today = todayDate();

  const [showPicker, setShowPicker] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  // A task shared WITH me that has subtasks: opens a window to tick them.
  const [viewingShared, setViewingShared] = useState<Task | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  // Finished items sit in a collapsed "Completed (N)" section (like the Tasks tab).
  const [completedOpen, setCompletedOpen] = useState(false);
  // Confetti: bumping the id plays one burst.
  const [burstId, setBurstId] = useState(0);

  const { tasks, habits, subtaskCounts, weekProgress, reload } = useTodayData(user.id, selectedDate, today);
  const friendNames = useFriendNames(tasks.map((t) => t.shared_owner_uid ?? t.shared_with_id));
  useSharedTasksFreshness(reload);
  const { refreshing, onRefresh } = usePullRefresh(reload);

  // Filters only narrow the view — the summary (DailySummary) and the real
  // "is the day empty" state are always computed against the full list.
  const showTasks = typeFilter !== 'habit';
  const showHabits = typeFilter !== 'task';
  const filteredTasks = showTasks ? tasks : [];
  const filteredHabits = showHabits ? habits : [];
  // Only plain check-off habits fold away once done; counter/timer habits stay
  // put (a timer keeps running past its target, a stepper can keep counting).
  const isFoldable = (h: HabitView) => h.completed && h.kind !== 'timer' && h.target == null;
  const openTasks = filteredTasks.filter((t) => t.completed_at === null);
  const doneTasks = filteredTasks.filter((t) => t.completed_at !== null);
  const openHabits = filteredHabits.filter((h) => !isFoldable(h));
  const doneHabits = filteredHabits.filter(isFoldable);
  const doneCount = doneTasks.length + doneHabits.length;
  const dayIsEmpty = tasks.length === 0 && habits.length === 0;
  const filterHidesEverything =
    !dayIsEmpty && filteredTasks.length === 0 && filteredHabits.length === 0;

  const isToday = selectedDate === today;
  // Habits can't be checked off while viewing a future day — counting an
  // unlived day as "done" would make streaks and history meaningless.
  const isFuture = selectedDate > today;

  // Completion counts for today's top summary.
  const habitsDone = habits.filter((h) => h.completed).length;
  const tasksDone = tasks.filter((t) => t.completed_at !== null).length;

  // CELEBRATION — confetti when the day becomes fully done, or a habit earns a
  // streak medal. Armed by the user's own check-off (so merely opening an
  // already-complete day never fires), judged once the reloaded data arrives.
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

  // Label set for the recurring-task card's "🔁 Every day / Mon·Wed·Fri /
  // every 3 days ..." badge — see helpers.buildScheduleLabels.
  const schedLabels = buildScheduleLabels(tr, (md) => shortDate(`2000-${md}`, lang));

  // Someone else's task shared with me: the check-off goes to the server (my
  // only write path); editing stays with the owner.
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
    // Completing a recurring task may fast-forward it to its next date instead
    // of being marked done — in that case the task is still not completed but
    // has a new date; the decision is based on the current DB state (see refreshTaskReminders).
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
    // Checking off uses a local reload (dataVersion doesn't bump); also refresh
    // the home screen widget. refreshWidget always computes for TODAY (not selectedDate).
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

  // An absolute value typed on the keyboard — handed off to the existing
  // delta-based incrementAmount by computing the difference; no separate repo function needed.
  const setHabitAmount = (h: HabitView, value: number) => {
    if (isFuture) return;
    if (value > h.amount) armCelebration(h);
    const goalDone = habitRepo.incrementAmount(h.id, selectedDate, value - h.amount, h.target);
    reload();
    refreshWidget(user.id);
    promptUnlinkGoalIfCompleted(h.id, goalDone, tr, reload);
  };

  const onPickDate = (picked: Date) => setSelectedDate(toYmd(picked));

  // The review card only needs to know whether there is a rate to show; it's
  // computed on review days only (a handful of queries once per data change).
  const reviewHasData = useMemo(
    () => isToday && isReviewDay(today) && loadReview(user.id, today).rate !== null,
    // habits/tasks change whenever the underlying data does (reload sets them)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isToday, today, user.id, habits, tasks]
  );

  // — Voice commands ("su içtim") — only offered on today's screen.
  // Runs a command the parser matched to one of today's items and describes
  // what happened; the Undo reverses exactly that write.
  const applyVoiceTarget = (target: Target): CommandNotice => {
    if (target.kind === 'task') {
      const t = tasks.find((x) => x.id === target.task.id);
      if (!t || t.completed_at !== null) return { text: tr('voiceCmd.alreadyDone', { title: target.task.title }) };
      armCelebration();
      taskRepo.setCompleted(t.id, true);
      notifySuccess();
      refreshTaskReminders(t.id);
      reload();
      // A recurring task jumps to its next date instead of staying completed;
      // reopening it would not move the date back, so no Undo is offered.
      const undo = t.recurrence
        ? undefined
        : () => {
            taskRepo.setCompleted(t.id, false);
            refreshTaskReminders(t.id);
            reload();
          };
      return { text: tr('voiceCmd.taskDone', { title: t.title }), undo };
    }
    const h = habits.find((x) => x.id === target.habit.id);
    if (!h) return { text: tr('voiceCmd.notUnderstood') };
    if (h.target != null && h.kind !== 'timer') {
      armCelebration(h);
      const goalDone = habitRepo.incrementAmount(h.id, today, target.amount, h.target);
      notifySuccess();
      reload();
      refreshWidget(user.id);
      promptUnlinkGoalIfCompleted(h.id, goalDone, tr, reload);
      return {
        text: tr('voiceCmd.habitAmount', { title: h.title, n: target.amount }),
        undo: () => {
          habitRepo.incrementAmount(h.id, today, -target.amount, h.target);
          reload();
          refreshWidget(user.id);
        },
      };
    }
    if (h.completed) return { text: tr('voiceCmd.alreadyDone', { title: h.title }) };
    armCelebration(h);
    const goalDone = habitRepo.toggleLog(h.id, today, true);
    notifySuccess();
    reload();
    refreshWidget(user.id);
    promptUnlinkGoalIfCompleted(h.id, goalDone, tr, reload);
    return {
      text: tr('voiceCmd.habitDone', { title: h.title }),
      undo: () => {
        habitRepo.toggleLog(h.id, today, false);
        reload();
        refreshWidget(user.id);
      },
    };
  };

  const handleVoiceCommand = (text: string, show: (n: CommandNotice) => void) => {
    const cmd = parseVoiceCommand(text, lang, {
      habits: habits.map((h) => ({ id: h.id, title: h.title, kind: h.kind })),
      // Someone else's shared task is checked off through the server, never by voice.
      tasks: tasks.filter((t) => t.completed_at === null && !t.shared_owner_uid).map((t) => ({ id: t.id, title: t.title })),
    });
    if (cmd.kind === 'none') {
      show({ text: tr('voiceCmd.notUnderstood') });
      return;
    }
    if (cmd.kind === 'one') {
      show(applyVoiceTarget(cmd.target));
      return;
    }
    // Android shows at most three buttons: tapping outside cancels.
    Alert.alert(
      tr('voiceCmd.chooseTitle'),
      undefined,
      cmd.options.map((o) => ({
        text: o.kind === 'habit' ? o.habit.title : o.task.title,
        onPress: () => show(applyVoiceTarget(o)),
      })),
      { cancelable: true }
    );
  };

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

  const renderHabit = (h: HabitView) =>
    h.kind === 'timer' ? (
      // Timer habit: read-only progress (control is in Phase B).
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
      // Numeric habit: enter an amount with the stepper (disabled on a future day).
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
      // Binary habit: tap the card to check it off (disabled on a future day).
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
        {/* Quota habit: weekly progress ("2/3"). Since the streak is
            weekly, the badge threshold is scaled by week×7. */}
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
            <HeaderActions />
          </View>
        </View>

        {/* Tap the date -> calendar opens (no icon, just text) */}
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

        {/* Progress summary for the day — only meaningful for today. */}
        {isToday && (
          <DailySummary
            habitsDone={habitsDone}
            habitsTotal={habits.length}
            tasksDone={tasksDone}
            tasksTotal={tasks.length}
          />
        )}

        {/* Sunday/Monday: the weekly review is ready (hidden once opened or dismissed). */}
        {isToday && <ReviewCard today={today} hasData={reviewHasData} />}

        {/* Check off by voice — hidden when the device has no speech recognition. */}
        {isToday && !dayIsEmpty && <VoiceCommandBar onHeard={handleVoiceCommand} />}

        {/* Type filter — only narrows the list view. "Hide completed" is now
            set as a persistent preference on Profile. */}
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

        {/* Tasks and habits in a single list, no separate heading. A priority
            dot marks a task, a 🔥 streak marks a habit. */}
        <View style={styles.list}>
          {dayIsEmpty ? (
            <EmptyState
              emoji={isToday ? '🎉' : '🌙'}
              title={isToday ? tr('empty.todayTitle') : tr('empty.otherDayTitle')}
              subtitle={isToday ? tr('empty.todayBody') : undefined}
            />
          ) : filterHidesEverything ? (
            <EmptyState emoji="🔍" title={tr('today.filterEmpty')} />
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
            </>
          )}
        </View>
      </ScrollView>

      <Confetti burstId={burstId} />

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
    // A finished habit recedes so what's still to do stands out.
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
    // The quota habit's "2/3" weekly progress indicator (on the right side of the card).
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
