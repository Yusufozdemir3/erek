// The STATS tab of the goal DETAIL screen — SPLIT OUT of app/goal/[id].tsx.
// The screen file carried all four tabs, form state, mutations, and this
// visualization together (~1080 lines); this tab is read-only (performs no
// mutations, only renders what useGoalStats produces), which is why it was
// the first to be split out.
//
// The section order is deliberate: a single-sentence VERDICT banner at the
// top ("will I make it in time?"), then an at-a-glance status, then the
// "required pace" and "your pace" groups meant to be read side by side,
// and the next milestone at the bottom.

import { Text, View } from 'react-native';
import { diffDays } from '@/lib/helpers';
import { shortDate } from '@/ui/theme';
import { fmtGoalValue } from '@/ui/goal/goalFormat';
import { StatCard, StatGroupTitle } from '@/ui/goal/GoalStatCards';
import type { GoalStyles } from '@/ui/goal/goalStyles';
import type { Goal } from '@/db';
import type { GoalStats } from '@/ui/useGoalStats';

type Lang = 'tr' | 'en' | 'de';
type Translate = (key: string, params?: Record<string, string | number>) => string;

// The single "verdict" banner at the top of the stats tab — answers the
// user's real question ("will I make it in time?") in one sentence instead
// of making them piece it together from 6 boxes. Only produced for numeric
// goals when pace/deadline data is available; otherwise null (banner isn't
// shown). tone drives the color: good=green, bad=red, neutral=accent.
type Verdict = { text: string; sub?: string; tone: 'good' | 'bad' | 'neutral' };
export function buildVerdict(
  goal: { goal_type: string; deadline: string | null; unit: string | null },
  stats: GoalStats,
  t: Translate,
  lang: Lang
): Verdict | null {
  if (goal.goal_type !== 'numeric') return null;
  if (stats.completed) return { text: t('goalStats.verdictDone'), tone: 'good' };

  // There's a projected finish date from the actual pace: compare it against the deadline.
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

  // No entries yet, but the required pace can be computed: just state the requirement.
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

export function GoalStatsTab({ goal, stats, t, lang, styles }: GoalStatsTabProps) {
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

        {/* Top row — at-a-glance "where am I": progress, remaining, deadline, days left */}
        <View style={styles.statsGrid}>
          {goal.goal_type === 'numeric' && (
            <>
              <StatCard label={t('goal.statRatio')} value={`%${Math.round(stats.ratio * 100)}`} styles={styles} />
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

        {/* Required pace — what the app needs from you (to hit the deadline) */}
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

        {/* Your pace — what you're actually doing; compared against the group above */}
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
              {/* "At this pace, what date will I finish" — also appears as a
                  sentence in the banner, but the user also wanted it as a card
                  (the banner is a one-glance comment, the card is a measurement). */}
              {stats.projectedFinishDate != null && (
                <StatCard
                  label={t('goalStats.projectedFinishLabel')}
                  value={shortDate(stats.projectedFinishDate, lang)}
                  styles={styles}
                />
              )}
              {/* "At this pace, what will the amount be by the chosen deadline" —
                  if the deadline has passed, this is the ACTUAL value, not a
                  projection (goalProjection). */}
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

        {/* NEXT MILESTONE — shown for EVERY goal that has milestones,
            regardless of type. Aggregate pace (days/milestone,
            milestones/week) was deliberately REMOVED: the user's question
            isn't "how many milestones are left in total" but "what am I
            working on right now and am I on track". A milestone without an
            amount (checklist) shows no target/remaining cards — that
            milestone has no numeric threshold. */}
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
                    value={`%${Math.round(stats.nextMilestone.ratio * 100)}`}
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
