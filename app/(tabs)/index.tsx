// "Today" tab — the daily summary screen.
// Two sections stacked: (1) tasks due that day, (2) daily habits + streak.
// No adding here; task/habit adding lives on their own tabs. This screen is
// only for viewing/checking off.
// Tapping the date opens the calendar; you can jump to another day and check it off.
// Architecture rule: no SQL; only taskRepo / habitRepo are called.

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { habitRepo, reminderRepo, taskRepo } from '@/db';
import type { Task } from '@/db';
import { buildScheduleLabels, extractTime, scheduleLabel, toYmd, todayDate } from '@/lib/helpers';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { highestMilestone } from '@/lib/milestones';
import { refreshTaskReminders } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';
import { refreshWidget } from '@/widget/widgetData';
import { useTodayData, type HabitView } from '@/ui/useTodayData';
import { TaskEditModal } from '@/ui/TaskEditModal';
import { DatePickerModal } from '@/ui/DatePickerModal';
import { DailySummary } from '@/ui/DailySummary';
import { EmptyState } from '@/ui/EmptyState';
import { HabitToggle } from '@/ui/HabitToggle';
import { HabitTimer } from '@/ui/HabitTimer';
import { AmountStepper } from '@/ui/AmountStepper';
import { PriorityMark } from '@/ui/PriorityMark';
import { ProfileButton } from '@/ui/ProfileButton';
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
  const { user, selectedDate, setSelectedDate, hideCompleted } = useAppData();
  const today = todayDate();

  const [showPicker, setShowPicker] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const { tasks, habits, subtaskCounts, reload } = useTodayData(user.id, selectedDate, today);

  // Filters only narrow the view — the summary (DailySummary) and the real
  // "is the day empty" state are always computed against the full list.
  const showTasks = typeFilter !== 'habit';
  const showHabits = typeFilter !== 'task';
  const filteredTasks = showTasks
    ? tasks.filter((t) => !hideCompleted || t.completed_at === null)
    : [];
  const filteredHabits = showHabits
    ? habits.filter((h) => !hideCompleted || !h.completed)
    : [];
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

  // Label set for the recurring-task card's "🔁 Every day / Mon·Wed·Fri /
  // every 3 days ..." badge — see helpers.buildScheduleLabels.
  const schedLabels = buildScheduleLabels(tr, (md) => shortDate(`2000-${md}`, lang));

  const toggleTask = (t: Task) => {
    const completing = t.completed_at === null;
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
    habitRepo.toggleLog(h.id, selectedDate, completing);
    completing ? notifySuccess() : tapLight();
    reload();
    // Checking off uses a local reload (dataVersion doesn't bump); also refresh
    // the home screen widget. refreshWidget always computes for TODAY (not selectedDate).
    refreshWidget(user.id);
  };

  const adjustHabit = (h: HabitView, delta: number) => {
    if (isFuture) return;
    habitRepo.incrementAmount(h.id, selectedDate, delta, h.target);
    tapLight();
    reload();
    refreshWidget(user.id);
  };

  // An absolute value typed on the keyboard — handed off to the existing
  // delta-based incrementAmount by computing the difference; no separate repo function needed.
  const setHabitAmount = (h: HabitView, value: number) => {
    if (isFuture) return;
    habitRepo.incrementAmount(h.id, selectedDate, value - h.amount, h.target);
    reload();
    refreshWidget(user.id);
  };

  const onPickDate = (picked: Date) => setSelectedDate(toYmd(picked));

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content}>
        <View style={styles.headRow}>
          <Text style={shared.greeting}>{titleFor(selectedDate, today, lang, tr('tabs.today'))}</Text>
          <View style={styles.headRight}>
            {!isToday && (
              <Pressable onPress={() => setSelectedDate(today)} hitSlop={8}>
                <Text style={styles.backToday}>{tr('today.backToday')}</Text>
              </Pressable>
            )}
            <ProfileButton />
          </View>
        </View>

        {/* Tap the date -> calendar opens (no icon, just text) */}
        <Pressable onPress={() => setShowPicker(true)} hitSlop={6}>
          <Text style={[shared.subtitle, styles.dateLink, { textTransform: 'capitalize' }]}>
            {fullDateLabel(selectedDate, lang)}
          </Text>
        </Pressable>

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
              {filteredTasks.map((t) => {
                const done = t.completed_at !== null;
                const time = extractTime(t.due_date);
                return (
                  <Animated.View key={t.id} layout={LIST_LAYOUT} style={shared.card}>
                    {time && <TimeBadge time={time} endTime={t.end_time} />}
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
                      {(t.recurrence || subtaskCounts[t.id]) && (
                        <Text style={styles.subCount}>
                          {[
                            t.recurrence
                              ? `🔁 ${scheduleLabel(t.recurrence, schedLabels)}`
                              : null,
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
                  </Animated.View>
                );
              })}

              {filteredHabits.map((h) =>
                h.kind === 'timer' ? (
                  // Timer habit: read-only progress (control is in Phase B).
                  <Animated.View
                    key={h.id}
                    layout={LIST_LAYOUT}
                    style={[shared.card, isFuture && styles.futureCard]}
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
                    style={[shared.card, isFuture && styles.futureCard]}
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
                    style={[shared.card, isFuture && styles.futureCard]}
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
                      <Text style={shared.streak}>
                        {highestMilestone(h.weekQuota ? h.streak * 7 : h.streak)?.emoji ?? '🔥'} {h.streak}
                      </Text>
                    )}
                  </AnimatedPressable>
                )
              )}
            </>
          )}
        </View>
      </ScrollView>

      <TaskEditModal task={editingTask} onClose={() => setEditingTask(null)} onChanged={reload} />
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    backToday: { fontSize: 14, fontWeight: '700', color: c.primary },
    futureCard: { opacity: 0.5 },
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
    subCount: { fontSize: 12, color: c.muted, marginTop: 3 },
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
