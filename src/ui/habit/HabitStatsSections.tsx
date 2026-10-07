// Presentational sections of the habit stats screen: they only render props;
// `styles` comes from habitStatsStyles.ts.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { Habit } from '@/db';
import type { BucketTotal, GoalPeriodStat, HabitStats } from '@/ui/useHabitStats';
import type { CalendarDay } from '@/ui/useHabitCalendar';
import { ScoreLineChart } from '@/ui/ScoreLineChart';
import type { Colors } from '@/ui/theme';
import type { Lang } from '@/i18n/translations';
import {
  HISTORY_TRACK_H,
  HISTORY_VALUE_INSET,
  HISTORY_VALUE_LINE,
  HISTORY_VALUE_MIN_BAR,
  HISTORY_VISIBLE_COLS,
  type HabitStatsStyles,
} from '@/ui/habit/habitStatsStyles';
import {
  fmtGoalValue,
  fmtHistoryValue,
  historyBarLabel,
  inkOn,
  PERIOD_OPTIONS,
  PERIOD_UNIT_KEY,
  type ChartPeriod,
} from '@/ui/habit/habitStatsFormat';

type Styles = HabitStatsStyles;

export function StatCard({
  label,
  value,
  styles,
  icon,
}: {
  label: string;
  value: string;
  styles: Styles;
  icon?: ReactNode;
}) {
  return (
    <View style={styles.statCard}>
      {icon ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {icon}
          <Text style={styles.statValue}>{value}</Text>
        </View>
      ) : (
        <Text style={styles.statValue}>{value}</Text>
      )}
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// The Day/Week/Month tabs of the Score and History sections.
export function PeriodTabs({
  period,
  onChange,
  t,
  styles,
  locked = [],
  onLocked,
}: {
  period: ChartPeriod;
  onChange: (p: ChartPeriod) => void;
  t: (key: string) => string;
  styles: Styles;
  // Periods that need Plus: they show a lock and call onLocked instead.
  locked?: readonly ChartPeriod[];
  onLocked?: () => void;
}) {
  return (
    <View style={styles.statsPeriodRow}>
      {PERIOD_OPTIONS.map((p) => {
        const sel = period === p.key;
        const isLocked = locked.includes(p.key);
        return (
          <Pressable
            key={p.key}
            style={[styles.periodBtn, styles.statsPeriodBtn, sel && styles.periodBtnSel]}
            onPress={() => (isLocked ? onLocked?.() : onChange(p.key))}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            accessibilityLabel={isLocked ? `${t(p.labelKey)}. ${t('plus.lockedA11y')}` : undefined}
          >
            <Text style={[styles.periodText, sel && styles.periodTextSel]}>
              {t(p.labelKey)}
              {isLocked ? ' ' : ''}
            </Text>
            {isLocked && <Feather name="lock" size={11} color="#9ca3af" />}
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
  // Scroll to the newest bucket again when the tab changes (no remount).
  useEffect(() => {
    didAutoScroll.current = false;
  }, [period, buckets.length]);
  const [containerWidth, setContainerWidth] = useState(0);
  const max = Math.max(1, ...buckets.map((b) => b.total));
  // HISTORY_VISIBLE_COLS columns per screen; fewer buckets stretch to fill it.
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
              // The value sits inside the bar's top, or above a bar too short for it.
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
                    // On the bar: contrast ink; above it or on a faded bar: the habit color.
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
  lockedPeriods = [],
  onLocked,
}: {
  stats: HabitStats;
  habit: Habit;
  color: string;
  themeColors: Colors;
  lang: Lang;
  t: (key: string, params?: Record<string, string | number>) => string;
  styles: Styles;
  lockedPeriods?: readonly ChartPeriod[];
  onLocked?: () => void;
}) {
  const GOAL_LABEL_KEY: Record<GoalPeriodStat['key'], string> = {
    today: 'stats.goalToday',
    week: 'stats.goalWeek',
    month: 'stats.goalMonth',
    quarter: 'stats.goalQuarter',
    year: 'stats.goalYear',
  };

  const [scorePeriod, setScorePeriod] = useState<ChartPeriod>('day');
  const [historyPeriod, setHistoryPeriod] = useState<ChartPeriod>(lockedPeriods.includes('week') ? 'day' : 'week');

  // Every bucket; the chart scrolls.
  const scoreBuckets = stats.series ? stats.series[scorePeriod] : [];
  const scoreUnit = t(PERIOD_UNIT_KEY[scorePeriod]);
  // Labelled like the History bars (historyBarLabel).
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
                    <View style={[styles.statsGoalFill, { width: `${pct}%`, backgroundColor: color }]} />
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
          <PeriodTabs
            period={scorePeriod}
            onChange={setScorePeriod}
            t={t}
            styles={styles}
            locked={lockedPeriods}
            onLocked={onLocked}
          />
          {scoreBuckets.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <ScoreLineChart
                points={scorePoints}
                color={color}
                gridColor={themeColors.line}
                labelColor={themeColors.faint}
                lang={lang}
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
          <PeriodTabs
            period={historyPeriod}
            onChange={setHistoryPeriod}
            t={t}
            styles={styles}
            locked={lockedPeriods}
            onLocked={onLocked}
          />
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

// Monday-first month grid. Future days look like unscheduled ones (no extra legend).
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
                <Text style={[styles.calDayText, done && styles.calDayTextOn, missed && styles.calDayTextMissed]}>
                  {dayNum}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
