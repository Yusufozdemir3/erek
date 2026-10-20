// The goal screen's Stats tab (read-only): a one-sentence verdict, the
// at-a-glance status, the required pace next to the actual pace, then the next step.

import { Text, View } from 'react-native';
import { diffDays, todayDate } from '@/lib/helpers';
import { completionSummary } from '@/lib/goalCompletion';
import { percentLabel, shortDate } from '@/ui/theme';
import { fmtGoalValue } from '@/ui/goal/goalFormat';
import { StatCard, StatGroupTitle } from '@/ui/goal/GoalStatCards';
import type { GoalStyles } from '@/ui/goal/goalStyles';
import type { Goal } from '@/db';
import type { GoalStats } from '@/ui/useGoalStats';

type Lang = 'tr' | 'en' | 'de';
type Translate = (key: string, params?: Record<string, string | number>) => string;

// "Will I make it?" in one sentence; numeric goals with pace/deadline data only.
type Verdict = { text: string; sub?: string; tone: 'good' | 'bad' | 'neutral' };
export function buildVerdict(
  goal: { goal_type: string; deadline: string | null; unit: string | null },
  stats: GoalStats,
  t: Translate,
  lang: Lang
): Verdict | null {
  if (goal.goal_type !== 'numeric') return null;
  if (stats.completed) return { text: t('goalStats.verdictDone'), tone: 'good' };

  if (stats.projectedFinishDate) {
    const finish = shortDate(stats.projectedFinishDate, lang);
    if (goal.deadline) {
      const gap = diffDays(stats.projectedFinishDate, goal.deadline); // >0 = early
      if (gap > 0) return { text: t('goalStats.verdictEarly', { date: finish, n: gap }), tone: 'good' };
      if (gap === 0) return { text: t('goalStats.verdictOnTime', { date: finish }), tone: 'good' };
      return {
        text: t('goalStats.verdictLate', { date: finish, n: -gap }),
        sub:
          stats.dailyPace != null
            ? t('goalStats.verdictFix', { amount: fmtGoalValue(stats.dailyPace, goal.unit) })
            : undefined,
        tone: 'bad',
      };
    }
    return { text: t('goalStats.verdictFinish', { date: finish }), tone: 'neutral' };
  }

  // No pace yet: state what's required.
  if (stats.dailyPace != null && goal.deadline) {
    return {
      text: t('goalStats.verdictNeed', { amount: fmtGoalValue(stats.dailyPace, goal.unit) }),
      tone: 'neutral',
    };
  }
  return null;
}

export interface GoalStatsTabProps {
  goal: Goal;
  stats: GoalStats;
  t: Translate;
  lang: Lang;
  styles: GoalStyles;
}

// A finished goal looks back instead of forward: the open-goal cards (days left,
// pace needed, projections) mean nothing once it is done.
function CompletedStats({ goal, stats, t, lang, styles }: GoalStatsTabProps) {
  const s = completionSummary({
    startDate: goal.start_date,
    completedAt: goal.completed_at,
    deadline: goal.deadline,
    isNumeric: goal.goal_type === 'numeric',
    currentValue: goal.current_value,
    targetValue: goal.target_value,
    entries: stats.entries,
    milestonesDone: stats.milestonesDone,
    milestonesTotal: stats.milestonesTotal,
    today: todayDate(),
  });
  const sub =
    s.deadlineGap == null
      ? undefined
      : s.deadlineGap > 0
        ? t('goalDone.early', { n: s.deadlineGap })
        : s.deadlineGap === 0
          ? t('goalDone.onTime')
          : t('goalDone.late', { n: -s.deadlineGap });
  return (
    <View>
      <View style={[styles.verdict, styles.verdictGood]}>
        <Text style={[styles.verdictText, styles.verdictTextGood]}>{t('goalStats.verdictDone')}</Text>
        {sub && <Text style={styles.verdictSub}>{sub}</Text>}
      </View>

      <View style={styles.statsGrid}>
        {s.total != null && (
          <StatCard label={t('goalDone.reached')} value={fmtGoalValue(s.total, goal.unit)} accent="primary" styles={styles} />
        )}
        {s.overTarget != null && s.overTarget > 1.005 && (
          <StatCard
            label={t('goalDone.ofTarget')}
            value={percentLabel(Math.round(s.overTarget * 100), lang)}
            styles={styles}
          />
        )}
        <StatCard label={t('goalDone.duration')} value={String(s.durationDays)} styles={styles} />
        <StatCard label={t('goalDone.started')} value={shortDate(s.startDay, lang)} styles={styles} />
        <StatCard label={t('goalDone.finished')} value={shortDate(s.endDay, lang)} styles={styles} />
      </View>

      {s.total != null && s.avgDaily != null && (
        <>
          <StatGroupTitle label={t('goalDone.groupJourney')} styles={styles} />
          <View style={styles.statsGrid}>
            <StatCard label={t('goalDone.avgDaily')} value={fmtGoalValue(s.avgDaily, goal.unit)} styles={styles} />
            {s.bestDay && (
              <StatCard
                label={t('goalDone.bestDay', { date: shortDate(s.bestDay.day, lang) })}
                value={fmtGoalValue(s.bestDay.amount, goal.unit)}
                styles={styles}
              />
            )}
            {s.activeDays != null && s.activeDays > 0 && (
              <StatCard
                label={t('goalDone.activeDays')}
                value={`${s.activeDays} / ${s.durationDays}`}
                styles={styles}
              />
            )}
            {s.entryCount != null && s.entryCount > 0 && (
              <StatCard label={t('goalDone.entries')} value={String(s.entryCount)} styles={styles} />
            )}
          </View>
        </>
      )}

      {s.milestonesTotal > 0 && (
        <>
          <StatGroupTitle label={t('goalStats.groupMilestones')} styles={styles} />
          <View style={styles.statsGrid}>
            <StatCard
              label={t('goalDone.steps')}
              value={`${s.milestonesDone} / ${s.milestonesTotal}`}
              styles={styles}
            />
          </View>
        </>
      )}
    </View>
  );
}

export function GoalStatsTab(props: GoalStatsTabProps) {
  if (props.stats.completed) return <CompletedStats {...props} />;
  const { goal, stats, t, lang, styles } = props;
  return (
      <View>
        {(() => {
          const verdict = buildVerdict(goal, stats, t, lang);
          return verdict ? (
            <View
              style={[
                styles.verdict,
                verdict.tone === 'good' && styles.verdictGood,
                verdict.tone === 'bad' && styles.verdictBad,
              ]}
            >
              <Text
                style={[
                  styles.verdictText,
                  verdict.tone === 'good' && styles.verdictTextGood,
                  verdict.tone === 'bad' && styles.verdictTextBad,
                ]}
              >
                {verdict.text}
              </Text>
              {verdict.sub && <Text style={styles.verdictSub}>{verdict.sub}</Text>}
            </View>
          ) : null;
        })()}

        <View style={styles.statsGrid}>
          {goal.goal_type === 'numeric' && (
            <>
              <StatCard label={t('goal.statRatio')} value={percentLabel(Math.round(stats.ratio * 100), lang)} styles={styles} />
              <StatCard
                label={t('goal.statRemaining')}
                value={stats.remaining != null ? fmtGoalValue(stats.remaining, goal.unit) : '–'}
                styles={styles}
              />
            </>
          )}
          <StatCard
            label={t('goal.statDeadline')}
            value={goal.deadline ? shortDate(goal.deadline, lang) : '–'}
            styles={styles}
          />
          {stats.isOverdue ? (
            <StatCard
              label={t('goalStats.overdueDaysLabel')}
              value={String(stats.overdueDays)}
              accent="danger"
              styles={styles}
            />
          ) : stats.daysLeft != null ? (
            <StatCard label={t('goalStats.daysLeftLabel')} value={String(stats.daysLeft)} styles={styles} />
          ) : null}
        </View>

        {/* Required pace */}
        {goal.goal_type === 'numeric' && stats.dailyPace != null && (
          <>
            <StatGroupTitle label={t('goalStats.groupRequiredPace')} styles={styles} />
            <View style={styles.statsGrid}>
              <StatCard
                label={t('goalStats.dailyPaceLabel')}
                value={fmtGoalValue(stats.dailyPace, goal.unit)}
                accent="primary"
                styles={styles}
              />
              <StatCard
                label={t('goalStats.weeklyPaceLabel')}
                value={fmtGoalValue(stats.weeklyPace!, goal.unit)}
                styles={styles}
              />
            </View>
          </>
        )}

        {/* Actual pace, read against the one above */}
        {goal.goal_type === 'numeric' && stats.avgDaily != null && (
          <>
            <StatGroupTitle label={t('goalStats.groupYourPace')} styles={styles} />
            <View style={styles.statsGrid}>
              <StatCard
                label={t('goalStats.avgDailyLabel')}
                value={fmtGoalValue(stats.avgDaily, goal.unit)}
                styles={styles}
              />
              {stats.last7Total != null && (
                <StatCard
                  label={t('goalStats.last7Label')}
                  value={fmtGoalValue(stats.last7Total, goal.unit)}
                  styles={styles}
                />
              )}
              {stats.projectedFinishDate != null && (
                <StatCard
                  label={t('goalStats.projectedFinishLabel')}
                  value={shortDate(stats.projectedFinishDate, lang)}
                  styles={styles}
                />
              )}
              {/* Past the deadline this is the actual value. */}
              {stats.projectedAtDeadline != null && (
                <StatCard
                  label={t('goalStats.projectedAtDeadlineLabel')}
                  value={fmtGoalValue(stats.projectedAtDeadline, goal.unit)}
                  styles={styles}
                />
              )}
              {stats.behindAmount != null && Math.abs(stats.behindAmount) >= 0.05 && (
                <StatCard
                  label={t(stats.behindAmount > 0 ? 'goalStats.behindLabel' : 'goalStats.aheadLabel')}
                  value={fmtGoalValue(Math.abs(stats.behindAmount), goal.unit)}
                  accent={stats.behindAmount > 0 ? 'danger' : undefined}
                  styles={styles}
                />
              )}
              {stats.daysElapsed != null && (
                <StatCard
                  label={t('goalStats.daysElapsedLabel')}
                  value={String(stats.daysElapsed)}
                  styles={styles}
                />
              )}
            </View>
          </>
        )}

        {/* The next step (any goal with steps); a checklist step has no amount cards. */}
        {stats.milestonesTotal > 0 && (
          <>
            <StatGroupTitle label={t('goalStats.groupMilestones')} styles={styles} />
            {stats.nextMilestone ? (
              <>
                <Text style={styles.nextMilestoneTitle} numberOfLines={2}>
                  {stats.nextMilestone.title}
                </Text>
                <View style={styles.statsGrid}>
                  <StatCard
                    label={t('goalStats.nextMilestoneRatioLabel')}
                    value={percentLabel(Math.round(stats.nextMilestone.ratio * 100), lang)}
                    accent="primary"
                    styles={styles}
                  />
                  {stats.nextMilestone.targetAmount != null && (
                    <StatCard
                      label={t('goalStats.nextMilestoneTargetLabel')}
                      value={fmtGoalValue(stats.nextMilestone.targetAmount, goal.unit)}
                      styles={styles}
                    />
                  )}
                  {stats.nextMilestone.remainingAmount != null && (
                    <StatCard
                      label={t('goalStats.nextMilestoneRemainingLabel')}
                      value={fmtGoalValue(stats.nextMilestone.remainingAmount, goal.unit)}
                      styles={styles}
                    />
                  )}
                  {stats.nextMilestone.isOverdue ? (
                    <StatCard
                      label={t('goalStats.nextMilestoneOverdueLabel')}
                      value={String(stats.nextMilestone.overdueDays)}
                      accent="danger"
                      styles={styles}
                    />
                  ) : stats.nextMilestone.daysLeft != null ? (
                    <StatCard
                      label={t('goalStats.nextMilestoneDaysLeftLabel')}
                      value={String(stats.nextMilestone.daysLeft)}
                      styles={styles}
                    />
                  ) : null}
                </View>
              </>
            ) : (
              <Text style={styles.paceHint}>{t('goalStats.allMilestonesDone')}</Text>
            )}
          </>
        )}

        {!goal.deadline && <Text style={styles.paceHint}>{t('goalStats.noDeadline')}</Text>}
      </View>
  );
}
