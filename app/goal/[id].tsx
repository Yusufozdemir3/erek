// Goal detail screen, in tabs: Overview (progress entry, history, manual
// completion) · Stats · Steps · Edit. The Goals list only navigates here.
// Steps work on both goal types; only a 'milestone' goal completes from them.

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
import { deadlineLabel, percentLabel, shortDate } from '@/ui/theme';
import { makeGoalStyles } from '@/ui/goal/goalStyles';
import { GoalStatsTab } from '@/ui/goal/GoalStatsTab';
import { LinkedHabitRow } from '@/ui/goal/GoalStatCards';
import { fmtAmount, fmtGoalValue } from '@/ui/goal/goalFormat';
import { GoalEntryHistory } from '@/ui/goal/GoalEntryHistory';
import { GoalContributors } from '@/ui/goal/GoalContributors';
import { contributionShares, OWNER_KEY } from '@/lib/goalContributions';
import { GoalShareSection } from '@/ui/goal/GoalShareSection';
import { useFriendNames } from '@/ui/sharedTaskUi';

type GoalTab = 'overview' | 'stats' | 'milestones' | 'edit';

export default function GoalDetailScreen() {
  const { colors, shared } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeGoalStyles(colors);
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: GoalTab }>();
  const stats = useGoalStats(id);
  const [activeTab, setActiveTab] = useState<GoalTab>((tab as GoalTab) || 'overview');
  const [newMilestone, setNewMilestone] = useState('');
  // A new step's optional amount (numeric goals) and due date.
  const [newMilestoneAmount, setNewMilestoneAmount] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState<string | null>(null);
  const [showMilestoneDatePicker, setShowMilestoneDatePicker] = useState(false);
  // The amount field starts as a chip.
  const [showMilestoneAmount, setShowMilestoneAmount] = useState(false);
  const [entryText, setEntryText] = useState('');

  const goal = stats.goal;
  // Names of friends who added to this goal.
  const contributorNames = useFriendNames(stats.entries.map((e) => e.added_by));
  const shareName = (key: string) =>
    key === OWNER_KEY ? t('sharedGoal.you') : contributorNames.get(key) ?? t('friends.unknownName');
  const shares = contributionShares(stats.entries, OWNER_KEY, shareName);

  // After anything that may change completion, rebuild the reminders (none
  // for a completed goal). A missing permission is only reported from the
  // Edit tab, where the user changes reminders on purpose.
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
    // Duration goals: minutes typed, seconds stored.
    const amount = isTimeUnit(goal.unit) ? Math.round(parsed * 60) : parsed;
    // A delta (negative = correction); addProgress writes the entry itself.
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

  // — Steps tab —
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
    refreshReminder(); // steps may have completed or reopened the goal
    stats.reload();
  };
  const addMilestone = () => {
    const v = newMilestone.trim();
    if (!v || !goal) return;
    // Numeric goals: an amount makes the step a threshold; empty = a checklist item.
    const parsedAmount = parseFloat(newMilestoneAmount.replace(',', '.'));
    const amount =
      goal.goal_type === 'numeric' && Number.isFinite(parsedAmount) && parsedAmount > 0
        ? isTimeUnit(goal.unit)
          ? Math.round(parsedAmount * 60) // minutes -> seconds
          : parsedAmount
        : null;
    goalMilestoneRepo.create(goal.id, v, { amount, due_date: newMilestoneDate });
    setNewMilestone('');
    setNewMilestoneAmount('');
    setNewMilestoneDate(null);
    setShowMilestoneAmount(false);
    refreshMilestones();
  };
  // Only checklist steps are ticked by hand; thresholds fill from progress.
  const toggleMilestone = (m: GoalMilestone) => {
    goalMilestoneRepo.setCompleted(m.id, m.completed === 0);
    refreshMilestones();
  };
  const removeMilestone = (m: GoalMilestone) => {
    goalMilestoneRepo.softDelete(m.id);
    refreshMilestones();
  };

  // — Edit tab — goalRepo.update decides where a manual "Current value" change
  // goes (log_manual_change); don't write an entry here as well.
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
    // The user changed reminders on purpose: warn if permission is missing.
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

            {/* — Overview — */}
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

                    <GoalContributors shares={shares} unit={goal.unit} nameOf={shareName} />

                    <GoalEntryHistory
                      entries={stats.entries}
                      unit={goal.unit}
                      today={todayDate()}
                      styles={styles}
                      whoOf={(by) => (by ? contributorNames.get(by) ?? t('friends.unknownName') : null)}
                    />
                  </>
                ) : (
                  <View style={styles.entryRow}>
                    <Text style={styles.overviewLine}>
                      {stats.milestonesDone}/{stats.milestonesTotal}{' '}
                      {t('goal.milestoneCountSuffix', { n: stats.milestonesTotal })}
                    </Text>
                    {/* Manual completion, kept in step with the Steps tab. */}
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

                <GoalShareSection goal={goal} />
              </View>
            )}

            {/* — Stats — */}
            {activeTab === 'stats' && (
              <GoalStatsTab goal={goal} stats={stats} t={t} lang={lang} styles={styles} />
            )}

            {/* — Steps — thresholds fill from progress ("first 5 km", "first
                20 km" side by side); amount-less steps are ticked by hand. */}
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
                              {done ? '✓' : percentLabel(Math.round(v.ratio * 100), lang)}
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

                {/* Just a title and ＋; the amount/date chips appear below once a
                    title is typed, so the title field keeps its width. */}
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
                {/* Still shown when an amount/date is filled in, so clearing the title loses nothing. */}
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
                        <Feather
                          name="calendar"
                          size={12}
                          color={newMilestoneDate != null ? colors.primary : colors.muted}
                        />
                        {newMilestoneDate
                          ? ` ${shortDate(newMilestoneDate, lang)} ×`
                          : ` ${t('goal.milestoneDateChip')}`}
                      </Text>
                    </Pressable>
                  </View>
                )}
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

            {/* — Edit — */}
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
