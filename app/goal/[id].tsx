// Goal DETAIL screen — tabbed: Overview · Stats · Milestones · Edit.
// Editing used to open in a separate modal (GoalEditModal); it's now a tab on
// this screen — one single source of truth, lower maintenance cost.
// Milestones (goal_milestones) can now be added as an optional checklist on
// BOTH goal types — for 'milestone' type it keeps its automatic-completion
// logic, for 'numeric' type it's purely an organizational aid (a numeric
// goal's completion always comes from current_value>=target_value).
// ALL data ENTRY ("entry") happens on the Overview tab: a +1/+5/−1 counter for
// numeric goals, manual "mark completed" for milestone goals — the list screen
// (goals.tsx) is now a read-only summary/navigation surface.
// Opens from the "Goals" tab in three ways: tap the title (edit tab), swipe to
// edit (edit tab), the 📊 icon (stats tab); otherwise defaults to Overview.
// Architecture rule: no SQL; only useGoalStats + goalRepo/goalMilestoneRepo are called.

import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { goalMilestoneRepo, goalRepo, reminderRepo } from '@/db';
import type { GoalMilestone } from '@/db';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { fmtClock, isTimeUnit, todayDate, toYmd } from '@/lib/helpers';
import { cancelGoalReminders, scheduleGoalReminders } from '@/lib/notifications';
import { NUMBER_MAX_LEN, TITLE_MAX_LEN } from '@/ui/formLimits';
import { DatePickerModal } from '@/ui/DatePickerModal';
import { GoalForm, type GoalFormValues } from '@/ui/GoalForm';
import { useGoalStats } from '@/ui/useGoalStats';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { deadlineLabel, shortDate } from '@/ui/theme';
import { makeGoalStyles, type GoalStyles } from '@/ui/goal/goalStyles';
import { GoalStatsTab } from '@/ui/goal/GoalStatsTab';
import { LinkedHabitRow } from '@/ui/goal/GoalStatCards';
import { fmtAmount, fmtEntryWhen, fmtGoalValue } from '@/ui/goal/goalFormat';

type Styles = GoalStyles;
type GoalTab = 'overview' | 'stats' | 'milestones' | 'edit';

export default function GoalDetailScreen() {
  const { colors, shared } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeGoalStyles(colors);
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: GoalTab }>();
  const stats = useGoalStats(id);
  const [activeTab, setActiveTab] = useState<GoalTab>((tab as GoalTab) || 'overview');
  const [newMilestone, setNewMilestone] = useState('');
  // The new milestone's optional amount (only shown for a numeric goal) and due date.
  const [newMilestoneAmount, setNewMilestoneAmount] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState<string | null>(null);
  const [showMilestoneDatePicker, setShowMilestoneDatePicker] = useState(false);
  // The amount field is COLLAPSED by default (as a chip) — tapping the chip expands it.
  const [showMilestoneAmount, setShowMilestoneAmount] = useState(false);
  // Free-form amount input on the Overview tab ("how much {unit} did you add?").
  const [entryText, setEntryText] = useState('');

  const goal = stats.goal;

  // — Overview tab: data entry ("entry") — the user types whatever amount they
  // want, and "Add" applies it as a DELTA on top of the accumulated progress
  // (goalRepo.addProgress is a delta, not an absolute value — entering a
  // negative number also works as a correction). addProgress itself logs the
  // daily entry (so linked-habit contributions land in the history too; see
  // goalRepo.addProgress).
  // After any mutation that may have changed completion status, rebuild
  // reminders from the current state: scheduleGoalReminders already just
  // cancels on its own for a completed/reminder-less goal (cancel-then-maybe-
  // schedule pattern). A permission denial (ok=false) is SILENTLY ignored here
  // (showing a warning on every entry/milestone change would be annoying) —
  // only handleEditSubmit (the moment the user deliberately changes the
  // reminder) checks the result and shows a warning. A real error (rejection)
  // stays at least visible via console.warn — it used to be swallowed entirely.
  const refreshReminder = (): Promise<boolean> => {
    const g = goalRepo.getById(id);
    if (!g) return Promise.resolve(true);
    return scheduleGoalReminders(g, reminderRepo.listByEntity('goal', id)).catch((e) => {
      console.warn('[Notification] Failed to update goal reminder:', e);
      return true;
    });
  };

  const submitEntry = () => {
    if (!goal) return;
    const parsed = parseFloat(entryText.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed === 0) return;
    // For a time-measured goal, minutes are entered but seconds are stored
    // (same unit as target/current_value — see the identical pattern in GoalForm).
    const amount = isTimeUnit(goal.unit) ? Math.round(parsed * 60) : parsed;
    // addProgress itself writes the entry record (with the actual applied
    // difference) — calling goalEntryRepo.create here too would DOUBLE-log it.
    goalRepo.addProgress(goal.id, amount);
    const g = goalRepo.getById(goal.id);
    g && goalRepo.progressRatio(g) >= 1 ? notifySuccess() : tapLight();
    setEntryText('');
    refreshReminder();
    stats.reload();
  };
  const toggleGoalCompleted = () => {
    if (!goal) return;
    const completing = goal.completed_at === null;
    goalRepo.setCompleted(goal.id, completing);
    completing ? notifySuccess() : tapLight();
    refreshReminder();
    stats.reload();
  };

  // — Milestones tab: mutations (used to live in GoalEditModal) —
  const syncGoalCompletion = () => {
    if (!goal) return;
    const { done, total } = goalMilestoneRepo.countForGoal(goal.id);
    if (total === 0) return;
    const current = goalRepo.getById(goal.id);
    if (!current) return;
    const shouldBeCompleted = done === total;
    const isCompleted = current.completed_at !== null;
    if (shouldBeCompleted && !isCompleted) {
      goalRepo.setCompleted(goal.id, true);
      notifySuccess();
    } else if (!shouldBeCompleted && isCompleted) {
      goalRepo.setCompleted(goal.id, false);
      tapLight();
    }
  };
  const refreshMilestones = () => {
    syncGoalCompletion();
    refreshReminder(); // milestones may have completed or reopened the goal
    stats.reload();
  };
  const addMilestone = () => {
    const v = newMilestone.trim();
    if (!v || !goal) return;
    // The amount is only meaningful for a numeric goal; if filled in, the
    // milestone becomes its own independent target (filled by entries, never
    // checked off manually) — otherwise it's an ordinary checklist item.
    const parsedAmount = parseFloat(newMilestoneAmount.replace(',', '.'));
    const amount =
      goal.goal_type === 'numeric' && Number.isFinite(parsedAmount) && parsedAmount > 0
        ? isTimeUnit(goal.unit)
          ? Math.round(parsedAmount * 60) // minutes are entered, seconds are stored
          : parsedAmount
        : null;
    goalMilestoneRepo.create(goal.id, v, { amount, due_date: newMilestoneDate });
    setNewMilestone('');
    setNewMilestoneAmount('');
    setNewMilestoneDate(null);
    setShowMilestoneAmount(false);
    refreshMilestones();
  };
  // Only checklist (amount-less) milestones are checked off manually; a
  // threshold milestone's state is derived from entries (see milestoneViews).
  const toggleMilestone = (m: GoalMilestone) => {
    goalMilestoneRepo.setCompleted(m.id, m.completed === 0);
    refreshMilestones();
  };
  const removeMilestone = (m: GoalMilestone) => {
    goalMilestoneRepo.softDelete(m.id);
    refreshMilestones();
  };

  // — Edit tab —
  // Manually changing "Current value" is a pure CORRECTION by DEFAULT — tempo/
  // projection (goalProjection.ts) is fed from the entry history, so it isn't
  // written there. If the user checks GoalForm's "Also add to progress
  // history" box, the difference is logged as an entry instead.
  // THE DECISION ITSELF NOW LIVES IN THE REPO (goalRepo.update's
  // log_manual_change field): since current_value is derived from entries (see
  // migration019), the question "does this go to the baseline or to an entry"
  // has exactly one correct answer, and both can't happen at once. Writing an
  // entry here as well used to detach the total from current_value, and the
  // value would jump on its own on the next sync round.
  const handleEditSubmit = (values: GoalFormValues) => {
    if (!goal) return;
    goalRepo.update(goal.id, {
      title: values.title,
      target_value: values.target_value,
      unit: values.unit,
      deadline: values.deadline,
      start_date: values.start_date,
      ...(values.current_value != null
        ? { current_value: values.current_value, log_manual_change: values.log_manual_change }
        : {}),
    });
    reminderRepo.replaceAll('goal', goal.id, values.remind_times);
    // The moment the user DELIBERATELY changed the reminder — warn on
    // permission denial (same pattern as the habit/task edit panels).
    refreshReminder().then((ok) => {
      if (!ok) Alert.alert(t('notif.noPermTitle'), t('notif.noPermBody'));
    });
    stats.reload();
    setActiveTab('overview');
  };
  const handleDelete = () => {
    if (!goal) return;
    goalRepo.softDelete(goal.id);
    cancelGoalReminders(goal.id).catch(() => {});
    router.back();
  };

  // The Milestones tab now exists for both goal types (see the file-header comment).
  const TABS: { key: GoalTab; labelKey: string; icon: keyof typeof Feather.glyphMap }[] = [
    { key: 'overview', labelKey: 'goal.tabOverview', icon: 'home' },
    { key: 'stats', labelKey: 'goal.tabStats', icon: 'bar-chart-2' },
    { key: 'milestones', labelKey: 'goal.milestones', icon: 'check-square' },
    { key: 'edit', labelKey: 'goal.tabEdit', icon: 'edit-2' },
  ];

  const dLabel = deadlineLabel(goal?.deadline ?? null, {
    daysLeft: (n) => t('date.daysLeft', { n }),
    dueToday: t('date.dueToday'),
    daysAgo: (n) => t('date.daysAgo', { n }),
  });

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backRow}>
          <Text style={styles.backText}>{t('common.back')}</Text>
        </Pressable>

        {!goal ? (
          <Text style={shared.empty}>{t('goalStats.notFound')}</Text>
        ) : (
          <>
            <Text style={shared.greeting}>{goal.title}</Text>

            {/* Tab bar */}
            <View style={styles.tabBar}>
              {TABS.map((tb) => {
                const active = activeTab === tb.key;
                return (
                  <Pressable
                    key={tb.key}
                    style={[styles.tabBtn, active && styles.tabBtnActive]}
                    onPress={() => setActiveTab(tb.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Feather name={tb.icon} size={15} color={active ? colors.primary : colors.faint} />
                    <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t(tb.labelKey)}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* — OVERVIEW — */}
            {activeTab === 'overview' && (
              <View>
                {stats.completed && (
                  <View style={styles.completedBanner}>
                    <Text style={styles.completedBannerText}>{t('goalStats.completed')}</Text>
                  </View>
                )}

                {goal.goal_type === 'numeric' ? (
                  <>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.round(stats.ratio * 100)}%` }]} />
                    </View>
                    <Text style={styles.overviewLine}>
                      {isTimeUnit(goal.unit)
                        ? `${fmtClock(goal.current_value)}${
                            goal.target_value != null ? ` / ${fmtClock(goal.target_value)}` : ''
                          }`
                        : `${fmtAmount(goal.current_value)}${
                            goal.target_value != null ? ` / ${fmtAmount(goal.target_value)}` : ''
                          }${goal.unit ? ` ${goal.unit}` : ''}`}
                    </Text>
                    {/* Data entry lives here — the user types an amount and
                        taps Add (see the file-header comment). Entering a
                        negative number also works as a correction. */}
                    <View style={styles.entryInputRow}>
                      <TextInput
                        style={styles.entryInput}
                        value={entryText}
                        onChangeText={setEntryText}
                        placeholder={isTimeUnit(goal.unit) ? t('habit.durationPlaceholder') : t('habit.amountPlaceholder')}
                        placeholderTextColor={colors.faint}
                        keyboardType="numeric"
                        onSubmitEditing={submitEntry}
                        returnKeyType="done"
                      />
                      <Pressable style={styles.entryAddBtn} onPress={submitEntry}>
                        <Text style={styles.entryAddText}>{t('common.add')}</Text>
                      </Pressable>
                    </View>

                    {/* Entry history — so the user can see it with dates (see the file-header comment). */}
                    {stats.entries.length > 0 && (
                      <View style={styles.entryHistory}>
                        <Text style={styles.entryHistoryTitle}>{t('goal.entryHistory')}</Text>
                        {stats.entries.map((e) => (
                          <View key={e.id} style={styles.entryHistoryRow}>
                            <Text
                              style={[
                                styles.entryHistoryAmount,
                                e.amount < 0 && styles.entryHistoryAmountNeg,
                              ]}
                            >
                              {e.amount >= 0 ? '+' : '-'}
                              {isTimeUnit(goal.unit)
                                ? fmtClock(Math.abs(e.amount))
                                : `${fmtAmount(Math.abs(e.amount))}${goal.unit ? ` ${goal.unit}` : ''}`}
                            </Text>
                            <Text style={styles.entryHistoryDate}>{fmtEntryWhen(e.updated_at, lang)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.entryRow}>
                    <Text style={styles.overviewLine}>
                      {stats.milestonesDone}/{stats.milestonesTotal}{' '}
                      {t('goal.milestoneCountSuffix', { n: stats.milestonesTotal })}
                    </Text>
                    {/* Manual "mark completed" toggle — stays in sync with the Milestones tab when there are milestones. */}
                    <Pressable
                      style={[styles.completeToggleBtn, stats.completed && styles.completeToggleBtnDone]}
                      onPress={toggleGoalCompleted}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: stats.completed }}
                    >
                      <Text style={[styles.completeToggleText, stats.completed && styles.completeToggleTextDone]}>
                        {stats.completed ? t('goal.markIncomplete') : t('goal.markComplete')}
                      </Text>
                    </Pressable>
                  </View>
                )}

                {!!dLabel && <Text style={styles.deadlineLine}>{dLabel}</Text>}

                {stats.linkedHabits.length > 0 && (
                  <>
                    <Text style={[shared.subtitle, styles.sectionTitle]}>{t('goalStats.linkedHabits')}</Text>
                    <View style={styles.card}>
                      {stats.linkedHabits.map((h, i) => (
                        <View key={h.id} style={i > 0 && styles.habitRowDivider}>
                          <LinkedHabitRow habit={h} styles={styles} />
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>
            )}

            {/* — STATS — a single result band at the top, a compact summary
                row below it and labeled groups (required pace / your pace).
                Hierarchy instead of dozens of equal boxes: the eye goes
                straight to "will I make it?" first. */}
            {activeTab === 'stats' && (
              <GoalStatsTab goal={goal} stats={stats} t={t} lang={lang} styles={styles} />
            )}

            {/* — MILESTONES — two modes: on a numeric goal, an amount-bearing
                milestone = its OWN INDEPENDENT target (e.g. "first 5km"/"first
                20km"/"first 50km" — all fill from current_value simultaneously,
                CANNOT be checked off, and show a percentage bar); an
                amount-less milestone = a manually checked checklist item
                (subtask pattern). See goalMilestoneRepo.milestoneViews. */}
            {activeTab === 'milestones' && (
              <View>
                {stats.milestoneViews.map((v) => {
                  const m = v.milestone;
                  const threshold = goal.goal_type === 'numeric' && m.amount != null && m.amount > 0;
                  const done = v.reached;
                  const overdue = !!m.due_date && !done && m.due_date < todayDate();
                  return (
                    <View key={m.id} style={styles.milestoneRow}>
                      {threshold ? (
                        <View style={{ flex: 1 }}>
                          <View style={styles.milestoneTopRow}>
                            <Text style={[styles.milestoneTitle, done && styles.milestoneTitleDone]}>
                              {m.title}
                            </Text>
                            <Text style={[styles.milestonePct, done && styles.milestonePctDone]}>
                              {done ? '✓' : `%${Math.round(v.ratio * 100)}`}
                            </Text>
                          </View>
                          <View style={styles.milestoneBarTrack}>
                            <View
                              style={[styles.milestoneBarFill, { width: `${Math.round(v.ratio * 100)}%` }]}
                            />
                          </View>
                          <View style={styles.milestoneMetaRow}>
                            <Text style={styles.milestoneMeta}>{fmtGoalValue(m.amount!, goal.unit)}</Text>
                            {m.due_date && (
                              <Text style={[styles.milestoneMeta, overdue && styles.milestoneMetaOverdue]}>
                                {shortDate(m.due_date, lang)}
                              </Text>
                            )}
                          </View>
                        </View>
                      ) : (
                        <>
                          <Pressable
                            onPress={() => toggleMilestone(m)}
                            hitSlop={8}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: done }}
                            accessibilityLabel={m.title}
                          >
                            <View style={[styles.milestoneBox, done && styles.milestoneBoxDone]}>
                              {done && <Text style={styles.milestoneCheck}>✓</Text>}
                            </View>
                          </Pressable>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.milestoneTitle, done && styles.milestoneTitleDone]}>
                              {m.title}
                            </Text>
                            {m.due_date && (
                              <Text style={[styles.milestoneMeta, overdue && styles.milestoneMetaOverdue]}>
                                {shortDate(m.due_date, lang)}
                              </Text>
                            )}
                          </View>
                        </>
                      )}
                      <Pressable
                        onPress={() => removeMilestone(m)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={t('goal.removeMilestoneA11y', { title: m.title })}
                      >
                        <Text style={styles.milestoneDelete}>×</Text>
                      </Pressable>
                    </View>
                  );
                })}

                {/* The add row is PROGRESSIVE: by default it's just a title
                    field + ＋. It used to also have the amount box and date
                    button on the same row, and their fixed widths
                    (76+~40+44+gaps ≈ 184px) left only ~135px for the title
                    field itself — down to ~105px once a date was picked (user
                    feedback: "not clean"). Now both appear in the chip row
                    below only once you start typing a title: the common case
                    (type a title, hit Enter) stays a single clean row. */}
                <View style={styles.milestoneAddRow}>
                  <TextInput
                    style={styles.milestoneInput}
                    value={newMilestone}
                    onChangeText={setNewMilestone}
                    placeholder={t('goal.addMilestone')}
                    placeholderTextColor={colors.faint}
                    onSubmitEditing={addMilestone}
                    blurOnSubmit={false}
                    returnKeyType="done"
                    maxLength={TITLE_MAX_LEN}
                  />
                  <Pressable
                    style={styles.milestoneAddBtn}
                    onPress={addMilestone}
                    accessibilityRole="button"
                    accessibilityLabel={t('goal.addMilestone')}
                  >
                    <Text style={styles.milestoneAddText}>＋</Text>
                  </Pressable>
                </View>
                {/* Chips: hidden while the title is empty — BUT stay visible if
                    an amount/date is already filled in, otherwise clearing the
                    title would silently discard the value the user had entered. */}
                {(newMilestone.trim().length > 0 || newMilestoneDate != null || newMilestoneAmount.length > 0) && (
                  <View style={styles.milestoneChipRow}>
                    {goal.goal_type === 'numeric' &&
                      (showMilestoneAmount || newMilestoneAmount.length > 0 ? (
                        <TextInput
                          style={styles.milestoneAmountInput}
                          value={newMilestoneAmount}
                          onChangeText={setNewMilestoneAmount}
                          placeholder={
                            isTimeUnit(goal.unit)
                              ? t('habit.durationPlaceholder')
                              : goal.unit ?? t('goal.milestoneAmountPlaceholder')
                          }
                          placeholderTextColor={colors.faint}
                          keyboardType="numeric"
                          maxLength={NUMBER_MAX_LEN}
                          autoFocus
                        />
                      ) : (
                        <Pressable
                          style={styles.milestoneChip}
                          onPress={() => setShowMilestoneAmount(true)}
                          accessibilityRole="button"
                          accessibilityLabel={t('goal.milestoneAmountPlaceholder')}
                        >
                          <Text style={styles.milestoneChipText}>
                            #{' '}
                            {isTimeUnit(goal.unit)
                              ? t('habit.durationPlaceholder')
                              : goal.unit ?? t('goal.milestoneAmountPlaceholder')}
                          </Text>
                        </Pressable>
                      ))}
                    <Pressable
                      style={[styles.milestoneChip, newMilestoneDate != null && styles.milestoneChipSet]}
                      onPress={() =>
                        newMilestoneDate ? setNewMilestoneDate(null) : setShowMilestoneDatePicker(true)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={t('goal.milestoneDueA11y')}
                    >
                      <Text
                        style={[styles.milestoneChipText, newMilestoneDate != null && styles.milestoneChipTextSet]}
                      >
                        {newMilestoneDate
                          ? `📅 ${shortDate(newMilestoneDate, lang)} ×`
                          : `📅 ${t('goal.milestoneDateChip')}`}
                      </Text>
                    </Pressable>
                  </View>
                )}
                {/* The app's own date picker — this used to be the native
                    DateTimePicker, with the same job (giving a milestone a due
                    date) done by DatePickerModal on the creation screen but by
                    the system calendar here. One picker: the same look/behavior everywhere. */}
                <DatePickerModal
                  visible={showMilestoneDatePicker}
                  value={new Date(`${newMilestoneDate ?? todayDate()}T00:00:00`)}
                  onClose={() => setShowMilestoneDatePicker(false)}
                  onConfirm={(picked) => setNewMilestoneDate(toYmd(picked))}
                />
                {goal.goal_type === 'numeric' && (
                  <Text style={styles.milestoneHint}>{t('goal.milestoneThresholdHint')}</Text>
                )}
              </View>
            )}

            {/* — EDIT — */}
            {activeTab === 'edit' && (
              <GoalForm
                key={goal.id}
                goalType={goal.goal_type}
                initial={{ ...goal, remind_times: reminderRepo.listByEntity('goal', goal.id).map((r) => r.time) }}
                submitLabel={t('common.save')}
                onSubmit={handleEditSubmit}
                onDelete={handleDelete}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
