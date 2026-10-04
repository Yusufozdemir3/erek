// "Goals" tab — two goal types:
//  - numeric: a progress bar (e.g. 40/100 km)
//  - milestone: can be broken into steps (same logic as task/subtask) — auto-
//    completes once all steps are done (if any).
// Both types now have a due date (mandatory, set in GoalForm) and can have
// optional milestones (goal_milestones) — not just mandatory for the
// 'milestone' type, a 'numeric' goal can also get them as an optional checklist.
// The list is a READ-ONLY summary/navigation surface: progress entry (numeric
// stepper), marking complete (milestone), and adding milestones no longer
// happen here — all of it lives on the /goal/[id] screen's 'Overview'/
// 'Milestones' tabs ("entry" in one single place).
// No adding here: that happens from the ＋ menu in the tab bar (the form lives in AddSheet).
// Architecture rule: no SQL; only goalRepo/goalMilestoneRepo are called.

import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { goalMilestoneRepo, goalRepo, milestoneViews } from '@/db';
import type { Goal } from '@/db';
import { fmtClock, isTimeUnit } from '@/lib/helpers';
import { cancelGoalReminders, rescheduleEverything } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';
import { EmptyState } from '@/ui/EmptyState';
import { UndoSnackbar, useUndoNotice } from '@/ui/UndoSnackbar';
import { HeaderActions } from '@/ui/HeaderActions';
import { FeatureGuide } from '@/ui/guide/FeatureGuide';
import { useFeatureGuide } from '@/ui/guide/useFeatureGuide';
import { usePullRefresh } from '@/ui/usePullRefresh';
import { SharedGoalsSection, useSharedLists } from '@/ui/SharedLists';
import { SwipeableRow } from '@/ui/SwipeableRow';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { deadlineLabel, percentLabel, type Colors } from '@/ui/theme';

export default function GoalsScreen() {
  const { colors, shared } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  const { user, dataVersion, authUser } = useAppData();
  const guide = useFeatureGuide('goals');

  const [goals, setGoals] = useState<Goal[]>([]);
  const [milestoneCounts, setMilestoneCounts] = useState<Record<string, { done: number; total: number }>>({});
  // Only one card's swipe actions may be open at a time.
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  // Editing is no longer a separate modal — it's the 'edit' tab on the
  // /goal/[id] screen (see app/goal/[id].tsx). The stats icon opens the same
  // screen on the 'stats' tab.
  const openGoal = (id: string, tab: 'stats' | 'edit') =>
    router.push({ pathname: '/goal/[id]', params: { id, tab } });

  const reload = useCallback(() => {
    const list = goalRepo.listByUser(user.id);
    setGoals(list);
    // Milestone badges are derived from the views: a threshold (amount-bearing)
    // milestone's "done" state lives NOT in the completed column but in the
    // goal's current_value (see milestoneViews). The number of goals is small
    // — a query per goal is acceptable (same rationale as useGoalStats.linkedHabits).
    const counts: Record<string, { done: number; total: number }> = {};
    for (const g of list) {
      const views = milestoneViews(goalMilestoneRepo.listByGoal(g.id), g.current_value);
      if (views.length > 0) {
        counts[g.id] = { done: views.filter((v) => v.reached).length, total: views.length };
      }
    }
    setMilestoneCounts(counts);
    // dataVersion: refreshes without losing focus when a goal is added from the ＋ menu.
  }, [user.id, dataVersion]);

  useFocusEffect(reload);
  const shared_ = useSharedLists();
  const { refreshing, onRefresh } = usePullRefresh(() => {
    reload();
    shared_.reload();
  });

  // Delete confirmation now lives in SwipeableRow's own two-tap action button
  // (the panel that opens to the right) — deletion here is immediate.
  const undo = useUndoNotice();
  const remove = (id: string) => {
    const title = goals.find((g) => g.id === id)?.title ?? '';
    goalRepo.softDelete(id);
    cancelGoalReminders(id).catch(() => {});
    undo.show({
      text: t('undo.deleted', { title }),
      onUndo: () => {
        goalRepo.restore(id);
        rescheduleEverything(user.id).catch(() => {});
        reload();
      },
    });
    reload();
  };

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView
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
      >
        <View style={shared.headerRow}>
          <Text style={shared.greeting}>{t('tabs.goals')}</Text>
          <HeaderActions onHelp={guide.open} />
        </View>
        <Text style={shared.subtitle}>{t('screen.goalsSubtitle')}</Text>

        {/* LIST */}
        {goals.length === 0 ? (
          <EmptyState
            emoji="🎯"
            title={t('empty.goalsTitle')}
            subtitle={t('empty.goalsBody')}
          />
        ) : (
          goals.map((goal, i) => {
            const ratio = goalRepo.progressRatio(goal);
            const completed = goalRepo.isCompleted(goal);
            const counts = milestoneCounts[goal.id];
            const dLabel = deadlineLabel(goal.deadline, {
              daysLeft: (n) => t('date.daysLeft', { n }),
              dueToday: t('date.dueToday'),
              daysAgo: (n) => t('date.daysAgo', { n }),
            });
            return (
              <View key={goal.id} style={[styles.rowSpacing, i === 0 && { marginTop: 20 }]}>
              <SwipeableRow
                isOpen={openRowId === goal.id}
                onOpenChange={(open) => setOpenRowId(open ? goal.id : null)}
                onEdit={() => openGoal(goal.id, 'edit')}
                onDelete={() => remove(goal.id)}
                editA11yLabel={t('common.editA11y', { title: goal.title })}
                deleteA11yLabel={t('common.deleteA11y', { title: goal.title })}
              >
              {/* marginBottom removed (0) — see the same fix comment in tasks.tsx. */}
              <View style={[styles.goalCard, styles.noMargin]}>
                <View style={styles.goalHead}>
                  {/* Read-only status indicator — checking off now happens on
                      /goal/[id]'s Overview tab (see the file-header comment). */}
                  {goal.goal_type === 'milestone' && (
                    <View style={[styles.checkbox, completed && styles.checkboxDone]}>
                      {completed && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  )}
                  {/* Tapping the title opens the goal screen on the 'Edit' tab */}
                  <Pressable style={styles.titleArea} onPress={() => openGoal(goal.id, 'edit')}>
                    <Text style={[styles.goalTitle, completed && styles.goalTitleDone]}>{goal.title}</Text>
                  </Pressable>
                  {/* Tapping the icon opens the same screen on the 'Stats' tab (see the week strip in habits.tsx) */}
                  <Pressable
                    onPress={() => openGoal(goal.id, 'stats')}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('goal.statsA11y', { title: goal.title })}
                  >
                    <View style={styles.statsPill}>
                      <Feather name="bar-chart-2" size={14} color={colors.muted} />
                      <Text style={styles.statsPillText}>{t('goal.statsLabel')}</Text>
                    </View>
                  </Pressable>
                </View>

                {goal.goal_type === 'numeric' && (
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} />
                  </View>
                )}
                {/* One compact meta row: value · percent · steps on the left,
                    the due-date label on the right. */}
                {(() => {
                  const parts: string[] = [];
                  if (goal.goal_type === 'numeric') {
                    parts.push(
                      isTimeUnit(goal.unit)
                        ? `${fmtClock(goal.current_value)}${
                            goal.target_value != null ? ` / ${fmtClock(goal.target_value)}` : ''
                          }`
                        : `${goal.current_value}${
                            goal.target_value != null ? ` / ${goal.target_value}` : ''
                          }${goal.unit ? ` ${goal.unit}` : ''}`
                    );
                    if (goal.target_value != null) parts.push(percentLabel(Math.round(ratio * 100), lang));
                  }
                  // Milestones can show on both types (see the file-header comment).
                  if (counts && counts.total > 0) {
                    parts.push(
                      `${counts.done}/${counts.total} ${t('goal.milestoneCountSuffix', { n: counts.total })}`
                    );
                  }
                  if (parts.length === 0 && !dLabel) return null;
                  return (
                    <View style={styles.metaRow}>
                      <Text style={[styles.goalMeta, styles.metaLeft]} numberOfLines={2}>
                        {parts.join('  ·  ')}
                      </Text>
                      {!!dLabel && <Text style={styles.deadlineLeft}>{dLabel}</Text>}
                    </View>
                  );
                })()}
              </View>
              </SwipeableRow>
              </View>
            );
          })
        )}

        <SharedGoalsSection items={shared_.sharedGoals} onHide={shared_.hideGoal} />
      </ScrollView>
      <UndoSnackbar notice={undo.notice} onDone={undo.dismiss} />
      <FeatureGuide
        guide="goals"
        visible={guide.visible}
        onClose={guide.close}
        canShare={!!authUser && !authUser.isAnonymous}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    goalCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 13,
      marginBottom: 10, // overridden by noMargin (see rowSpacing); moved to the outer wrapper
    },
    goalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxDone: { backgroundColor: c.done, borderColor: c.done },
    checkmark: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
    titleArea: { flex: 1 },
    goalTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    goalTitleDone: { color: c.faint, textDecorationLine: 'line-through' },
    rowSpacing: { marginBottom: 10 },
    noMargin: { marginBottom: 0 },

    progressTrack: {
      height: 9,
      borderRadius: 5,
      backgroundColor: c.track,
      marginTop: 10,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 5, backgroundColor: c.primary },
    goalMeta: { fontSize: 14, color: c.muted, fontWeight: '600' },
    metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 },
    metaLeft: { flex: 1 },
    // Due date — right end of the meta row.
    deadlineLeft: { fontSize: 12, color: c.streak, fontWeight: '700' },
    // "Stats" entry: the bare chart icon wasn't self-explanatory, so it gets a label.
    statsPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: c.inputBg,
      borderWidth: 1,
      borderColor: c.border,
    },
    statsPillText: { fontSize: 12, fontWeight: '600', color: c.muted },
  });
