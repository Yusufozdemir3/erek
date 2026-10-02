// A friend's goal, shared with you: the same overview and stats as your own
// goals, plus — on a numeric goal — an input to add progress of your own to
// THEIR goal (see src/sync/sharedGoals.ts). Nothing here is editable beyond
// that: title, target, deadline and milestones stay with the owner.
// Data is served from cache first and refreshed from the server
// (src/ui/useSharedGoal.ts). Contributing needs a connection.

import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { fmtClock, isTimeUnit, todayDate } from '@/lib/helpers';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { sharingErrorKey } from '@/sync';
import { useAppData } from '@/ui/AppData';
import { useSharedGoal } from '@/ui/useSharedGoal';
import { NudgeButton } from '@/ui/NudgeButton';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { deadlineLabel, percentLabel, shortDate } from '@/ui/theme';
import { makeGoalStyles } from '@/ui/goal/goalStyles';
import { GoalStatsTab } from '@/ui/goal/GoalStatsTab';
import { fmtAmount, fmtEntryWhen, fmtGoalValue } from '@/ui/goal/goalFormat';
import { NUMBER_MAX_LEN } from '@/ui/formLimits';

type Tab = 'overview' | 'stats';

export default function SharedGoalScreen() {
  const { colors, shared: sharedStyles } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeGoalStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { authUser } = useAppData();
  const { detail, stats, status, contribute } = useSharedGoal(id);
  const [tab, setTab] = useState<Tab>('overview');
  const [entryText, setEntryText] = useState('');
  const [busy, setBusy] = useState(false);

  const goal = detail?.goal ?? null;
  const ownerName = detail?.owner.displayName ?? t('friends.unknownName');
  const nameOf = (uid: string | null): string =>
    uid && uid === authUser?.id
      ? t('sharedGoal.you')
      : (uid && detail?.names[uid]) || t('friends.unknownName');

  const submit = async () => {
    if (!goal || busy) return;
    const parsed = parseFloat(entryText.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed === 0) return;
    // Time goals: minutes are entered, seconds are stored (same as the owner's screen).
    const amount = isTimeUnit(goal.unit) ? Math.round(parsed * 60) : parsed;
    setBusy(true);
    try {
      await contribute(amount);
      setEntryText('');
      amount > 0 ? notifySuccess() : tapLight();
    } catch (e) {
      Alert.alert(t('friends.errorTitle'), t(sharingErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const dLabel = deadlineLabel(goal?.deadline ?? null, {
    daysLeft: (n) => t('date.daysLeft', { n }),
    dueToday: t('date.dueToday'),
    daysAgo: (n) => t('date.daysAgo', { n }),
  });

  const fmtValue = (v: number) =>
    goal && isTimeUnit(goal.unit) ? fmtClock(v) : `${fmtAmount(v)}${goal?.unit ? ` ${goal.unit}` : ''}`;

  const TABS: { key: Tab; labelKey: string; icon: keyof typeof Feather.glyphMap }[] = [
    { key: 'overview', labelKey: 'goal.tabOverview', icon: 'home' },
    { key: 'stats', labelKey: 'goal.tabStats', icon: 'bar-chart-2' },
  ];

  return (
    <SafeAreaView style={sharedStyles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={sharedStyles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backRow}>
          <Text style={styles.backText}>{t('common.back')}</Text>
        </Pressable>

        {status === 'gone' ? (
          <Text style={sharedStyles.empty}>{t('sharedGoal.gone')}</Text>
        ) : !goal ? (
          <Text style={sharedStyles.empty}>
            {status === 'offline' ? t('friends.err.ERK_NETWORK') : t('sharedHabit.loading')}
          </Text>
        ) : (
          <>
            <Text style={sharedStyles.greeting}>{goal.title}</Text>
            <Text style={[sharedStyles.subtitle, { marginTop: 4 }]}>
              {t('friends.sharedBy', { name: ownerName })}
              {status === 'offline' ? ` · ${t('sharedHabit.offline')}` : ''}
            </Text>
            <NudgeButton
              message={t('friends.nudgeGoalMessage', { name: ownerName, title: goal.title })}
            />

            <View style={styles.tabBar}>
              {TABS.map((tb) => {
                const active = tab === tb.key;
                return (
                  <Pressable
                    key={tb.key}
                    style={[styles.tabBtn, active && styles.tabBtnActive]}
                    onPress={() => setTab(tb.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Feather name={tb.icon} size={15} color={active ? colors.primary : colors.faint} />
                    <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t(tb.labelKey)}</Text>
                  </Pressable>
                );
              })}
            </View>

            {tab === 'overview' && (
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
                      {fmtValue(goal.current_value)}
                      {goal.target_value != null
                        ? ` / ${isTimeUnit(goal.unit) ? fmtClock(goal.target_value) : fmtAmount(goal.target_value)}`
                        : ''}
                    </Text>

                    <View style={styles.entryInputRow}>
                      <TextInput
                        style={styles.entryInput}
                        value={entryText}
                        onChangeText={setEntryText}
                        placeholder={
                          isTimeUnit(goal.unit) ? t('habit.durationPlaceholder') : t('habit.amountPlaceholder')
                        }
                        placeholderTextColor={colors.faint}
                        keyboardType="numeric"
                        maxLength={NUMBER_MAX_LEN}
                        onSubmitEditing={submit}
                        returnKeyType="done"
                        editable={!busy}
                        accessibilityLabel={t('sharedGoal.contributeA11y')}
                      />
                      <Pressable
                        style={[styles.entryAddBtn, busy && { opacity: 0.5 }]}
                        onPress={submit}
                        disabled={busy}
                        accessibilityRole="button"
                      >
                        <Text style={styles.entryAddText}>{t('common.add')}</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.milestoneHint}>{t('sharedGoal.contributeHint', { name: ownerName })}</Text>

                    {stats.entries.length > 0 && (
                      <View style={styles.entryHistory}>
                        <Text style={styles.entryHistoryTitle}>{t('goal.entryHistory')}</Text>
                        {stats.entries.map((e) => (
                          <View key={e.id} style={styles.entryHistoryRow}>
                            <Text style={[styles.entryHistoryAmount, e.amount < 0 && styles.entryHistoryAmountNeg]}>
                              {e.amount >= 0 ? '+' : '-'}
                              {fmtValue(Math.abs(e.amount))}
                            </Text>
                            <Text style={styles.entryHistoryDate}>
                              {nameOf(e.added_by)} · {fmtEntryWhen(e.updated_at, lang)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={styles.overviewLine}>
                    {stats.milestonesDone}/{stats.milestonesTotal}{' '}
                    {t('goal.milestoneCountSuffix', { n: stats.milestonesTotal })}
                  </Text>
                )}

                {!!dLabel && <Text style={styles.deadlineLine}>{dLabel}</Text>}

                {/* Milestones — read-only (they belong to the owner). */}
                {stats.milestoneViews.length > 0 && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={styles.entryHistoryTitle}>{t('goal.milestones')}</Text>
                    {stats.milestoneViews.map((v) => {
                      const m = v.milestone;
                      const threshold = goal.goal_type === 'numeric' && m.amount != null && m.amount > 0;
                      const overdue = !!m.due_date && !v.reached && m.due_date < todayDate();
                      return (
                        <View key={m.id} style={styles.milestoneRow}>
                          <View style={{ flex: 1 }}>
                            <View style={styles.milestoneTopRow}>
                              <Text style={[styles.milestoneTitle, v.reached && styles.milestoneTitleDone]}>
                                {m.title}
                              </Text>
                              <Text style={[styles.milestonePct, v.reached && styles.milestonePctDone]}>
                                {v.reached ? '✓' : threshold ? percentLabel(Math.round(v.ratio * 100), lang) : ''}
                              </Text>
                            </View>
                            {threshold && (
                              <View style={styles.milestoneBarTrack}>
                                <View style={[styles.milestoneBarFill, { width: `${Math.round(v.ratio * 100)}%` }]} />
                              </View>
                            )}
                            {(threshold || m.due_date) && (
                              <View style={styles.milestoneMetaRow}>
                                <Text style={styles.milestoneMeta}>
                                  {threshold ? fmtGoalValue(m.amount!, goal.unit) : ''}
                                </Text>
                                {m.due_date && (
                                  <Text style={[styles.milestoneMeta, overdue && styles.milestoneMetaOverdue]}>
                                    {shortDate(m.due_date, lang)}
                                  </Text>
                                )}
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {tab === 'stats' && (
              <GoalStatsTab goal={goal} stats={{ ...stats, reload: () => {} }} t={t} lang={lang} styles={styles} />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
