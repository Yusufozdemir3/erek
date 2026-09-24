// Visual sections of the habit stats screen — SPLIT OUT of app/habit/[id].tsx
// (audit finding H1: the screen file was 750 lines and ~390 of that was
// already standalone presentational components).
//
// All of them are read-only: they don't read data or perform mutations; they
// just render the given props. The `styles` prop comes from the screen's
// style factory (habitStatsStyles.ts) so theme/sizing stays managed from a
// single place.

import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fmtClock, isQuotaSchedule } from '@/lib/helpers';
import type { Habit } from '@/db';
import type { BucketTotal, GoalPeriodStat, HabitChartSeries, HabitStats } from '@/ui/useHabitStats';
import type { CalendarDay } from '@/ui/useHabitCalendar';
import { ScoreLineChart } from '@/ui/ScoreLineChart';
import { DATE_LOCALE, type Colors } from '@/ui/theme';
import type { Lang } from '@/i18n/translations';
import {
  HISTORY_LABEL_GAP,
  HISTORY_LABEL_H,
  HISTORY_ROW_H,
  HISTORY_TRACK_H,
  HISTORY_VALUE_INSET,
  HISTORY_VALUE_LINE,
  HISTORY_VALUE_MIN_BAR,
  HISTORY_VISIBLE_COLS,
  type HabitStatsStyles,
} from '@/ui/habit/habitStatsStyles';
import {
  fmtAmount,
  fmtCompact,
  fmtGoalValue,
  fmtHistoryValue,
  historyBarLabel,
  inkOn,
  PERIOD_OPTIONS,
  PERIOD_UNIT_KEY,
  type ChartPeriod,
} from '@/ui/habit/habitStatsFormat';

type Styles = HabitStatsStyles;

export function StatCard({ label, value, styles }: { label: string; value: string; styles: Styles }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Small Day/Week/Month tab selector — used by both the Score and History
// sections (the periodRow/periodBtn styles are SHARED with the Completion chart).
export function PeriodTabs({
  period,
  onChange,
  t,
  styles,
}: {
  period: ChartPeriod;
  onChange: (p: ChartPeriod) => void;
  t: (key: string) => string;
  styles: Styles;
}) {
  return (
    <View style={styles.statsPeriodRow}>
      {PERIOD_OPTIONS.map((p) => {
        const sel = period === p.key;
        return (
          <Pressable
            key={p.key}
            style={[styles.periodBtn, styles.statsPeriodBtn, sel && styles.periodBtnSel]}
            onPress={() => onChange(p.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
          >
            <Text style={[styles.periodText, sel && styles.periodTextSel]}>{t(p.labelKey)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function HistoryBars({
  buckets,
  period,
  habit,
  color,
  lang,
  styles,
}: {
  buckets: BucketTotal[];
  period: ChartPeriod;
  habit: Habit;
  color: string;
  lang: Lang;
  styles: Styles;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const didAutoScroll = useRef(false);
  // The component doesn't remount when the period (Day/Week/Month) changes,
  // so the flag stayed set and the "latest data on the right" auto-scroll got
  // skipped — the user would tap a tab and end up looking at the OLDEST of 30
  // buckets. The same fix exists in the Score chart (see ScoreLineChart).
  useEffect(() => {
    didAutoScroll.current = false;
  }, [period, buckets.length]);
  const [containerWidth, setContainerWidth] = useState(0);
  const max = Math.max(1, ...buckets.map((b) => b.total));
  // Column width: divide the screen into HISTORY_VISIBLE_COLS buckets. If
  // there are FEWER buckets than that (e.g. only 4 weeks), the existing
  // buckets fill the container — otherwise the bars stuck to the left edge
  // and left an ugly gap on the right (same fix as in the Score chart, see
  // ScoreLineChart).
  const colWidth = containerWidth > 0 ? containerWidth / Math.min(buckets.length, HISTORY_VISIBLE_COLS) : 0;

  return (
    <View onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
      {containerWidth > 0 && (
        <ScrollView
          ref={scrollRef}
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => {
            if (didAutoScroll.current) return;
            didAutoScroll.current = true;
            scrollRef.current?.scrollToEnd({ animated: false });
          }}
        >
          <View style={styles.statsHistoryRow}>
            {buckets.map((b, i) => {
              const pct = b.total > 0 ? Math.max(6, Math.round((b.total / max) * 100)) : 0;
              // Value text sits INSIDE the bar, near the top (user request:
              // "have the amounts written inside the columns"). If the bar is
              // too short to fit a line, the text moves ABOVE the bar.
              const barH = (HISTORY_TRACK_H * pct) / 100;
              const inside = barH >= HISTORY_VALUE_MIN_BAR;
              const valueTop = inside
                ? HISTORY_TRACK_H - barH + HISTORY_VALUE_INSET
                : HISTORY_TRACK_H - barH - HISTORY_VALUE_INSET - HISTORY_VALUE_LINE;
              return (
                <View key={b.bucketStart} style={[styles.statsHistoryCol, { width: colWidth }]}>
              <View style={styles.statsHistoryBarTrack}>
                {pct > 0 &&
                  (b.partial ? (
                    <View style={[styles.statsHistoryBar, { height: `${pct}%`, backgroundColor: color + '33' }]} />
                  ) : (
                    <LinearGradient
                      colors={[color, color + '66']}
                      style={[styles.statsHistoryBar, { height: `${pct}%` }]}
                    />
                  ))}
              </View>
              <Text
                style={[
                  styles.statsHistoryValue,
                  {
                    width: colWidth,
                    top: valueTop,
                    // Inside the bar the background is the habit color;
                    // outside, and on a faded (partial) bar, the background is the card itself.
                    color: inside && !b.partial ? inkOn(color) : color,
                  },
                ]}
                numberOfLines={1}
              >
                {fmtHistoryValue(habit, b.total)}
              </Text>
              <Text style={styles.statsHistoryLabel}>
                {historyBarLabel(period, b.bucketStart, i > 0 ? buckets[i - 1].bucketStart : null, lang)}
              </Text>
            </View>
          );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

export function HabitDarkStatsCard({
  stats,
  habit,
  color,
  themeColors,
  lang,
  t,
  styles,
}: {
  stats: HabitStats;
  habit: Habit;
  color: string;
  themeColors: Colors;
  lang: Lang;
  t: (key: string, params?: Record<string, string | number>) => string;
  styles: Styles;
}) {
  const GOAL_LABEL_KEY: Record<GoalPeriodStat['key'], string> = {
    today: 'stats.goalToday',
    week: 'stats.goalWeek',
    month: 'stats.goalMonth',
    quarter: 'stats.goalQuarter',
    year: 'stats.goalYear',
  };

  const [scorePeriod, setScorePeriod] = useState<ChartPeriod>('day');
  const [historyPeriod, setHistoryPeriod] = useState<ChartPeriod>('week');

  // The chart is now horizontally scrollable (see ScoreLineChart) — ALL
  // existing buckets are shown, and whatever doesn't fit the screen is
  // reached by scrolling; no separate window clipping is needed.
  const scoreBuckets = stats.series ? stats.series[scorePeriod] : [];
  const scoreUnit = t(PERIOD_UNIT_KEY[scorePeriod]);
  // Label: just the day number, with the month name added once when the
  // month changes (SAME logic as historyBarLabel — identical to the pattern
  // in the "History" bars; user request: don't repeat the month at every
  // point, don't clutter it).
  const scorePoints = scoreBuckets.map((b, i) => ({
    value: b.score,
    label: historyBarLabel(scorePeriod, b.date, i > 0 ? scoreBuckets[i - 1].date : null, lang),
    partial: b.partial,
  }));

  const historyBuckets = stats.historyTotals ? stats.historyTotals[historyPeriod] : [];

  if (stats.goalPeriods.length === 0 && !stats.series && !stats.historyTotals) return null;

  return (
    <View style={styles.statsCard}>
      {stats.goalPeriods.length > 0 && (
        <View style={styles.statsSection}>
          <Text style={styles.statsEyebrow}>{t('stats.goalTitle')}</Text>
          <View style={{ gap: 14, marginTop: 4 }}>
            {stats.goalPeriods.map((p) => {
              const pct = p.goal > 0 ? Math.min(100, (p.done / p.goal) * 100) : 0;
              return (
                <View key={p.key}>
                  <View style={styles.statsGoalHeadRow}>
                    <Text style={styles.statsGoalLabel}>{t(GOAL_LABEL_KEY[p.key])}</Text>
                    <Text style={styles.statsGoalValue}>
                      {fmtGoalValue(habit, p.done)} / {fmtGoalValue(habit, p.goal)}
                    </Text>
                  </View>
                  <View style={styles.statsGoalTrack}>
                    <View style={[styles.statsGoalFill, { width: `${pct}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {stats.series && (
        <View style={[styles.statsSection, styles.statsSectionBordered]}>
          <View style={styles.statsHeadRow}>
            <Text style={styles.statsTitle}>{t('stats.scoreTitle')}</Text>
            <Text style={styles.statsMeta}>{t('stats.scoreWindow', { n: scoreBuckets.length, unit: scoreUnit })}</Text>
          </View>
          <PeriodTabs period={scorePeriod} onChange={setScorePeriod} t={t} styles={styles} />
          {scoreBuckets.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <ScoreLineChart
                points={scorePoints}
                color={color}
                gridColor={themeColors.line}
                labelColor={themeColors.faint}
              />
            </View>
          )}
        </View>
      )}

      {stats.historyTotals && (
        <View style={[styles.statsSection, styles.statsSectionBordered]}>
          <View style={styles.statsHeadRow}>
            <Text style={styles.statsTitle}>{t('stats.historyTitle')}</Text>
          </View>
          <PeriodTabs period={historyPeriod} onChange={setHistoryPeriod} t={t} styles={styles} />
          {historyBuckets.length > 0 && (
            <HistoryBars
              buckets={historyBuckets}
              period={historyPeriod}
              habit={habit}
              color={color}
              lang={lang}
              styles={styles}
            />
          )}
        </View>
      )}
    </View>
  );
}

// Month calendar: Monday-first week grid, day number in each cell. Future
// days (not yet happened) share the same neutral look as "not scheduled" —
// deliberately the same style so it doesn't need a separate legend entry.
export function MonthCalendar({
  weeks,
  color,
  styles,
}: {
  weeks: (CalendarDay | null)[][];
  color: string;
  styles: Styles;
}) {
  return (
    <View>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.calRow}>
          {week.map((cell, ci) => {
            if (!cell) return <View key={ci} style={styles.calCell} />;
            const dayNum = Number(cell.date.slice(8, 10));
            const missed = cell.scheduled && !cell.completed && !cell.future;
            const done = cell.scheduled && cell.completed;
            return (
              <View
                key={ci}
                style={[
                  styles.calCell,
                  styles.calCellFilled,
                  (!cell.scheduled || cell.future) && styles.cellUnscheduled,
                  missed && styles.cellMissed,
                  done && { backgroundColor: color },
                ]}
              >
                <Text style={[styles.calDayText, done && styles.calDayTextOn]}>{dayNum}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
