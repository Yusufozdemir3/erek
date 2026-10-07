// The habit stats body, shared by the local screen and a friend's shared habit
// (both pass HabitStats / HabitCalendar).

import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Feather } from '@expo/vector-icons';
import { isQuotaSchedule } from '@/lib/helpers';
import { FREE_CALENDAR_MONTHS_BACK, isChartPeriodFree } from '@/plus/plusLogic';
import { promptPlus } from '@/plus/openPlus';
import { useFeaturesUnlocked } from '@/plus/plusStore';
import { PERIOD_OPTIONS } from '@/ui/habit/habitStatsFormat';
import { STREAK_MILESTONES } from '@/lib/milestones';
import type { Habit } from '@/db';
import type { HabitStats } from '@/ui/useHabitStats';
import type { HabitCalendar } from '@/ui/useHabitCalendar';
import { HabitIconGlyph } from '@/ui/habitIcons';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { DATE_LOCALE, DEFAULT_HABIT_COLOR } from '@/ui/theme';
import { makeHabitStatsStyles } from '@/ui/habit/habitStatsStyles';
import { HabitDarkStatsCard, MonthCalendar, StatCard } from '@/ui/habit/HabitStatsSections';

interface Props {
  stats: HabitStats & { habit: Habit };
  calendar: HabitCalendar;
  subtitle?: ReactNode;
}

export function HabitStatsBody({ stats, calendar, subtitle }: Props) {
  const { colors, shared } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeHabitStatsStyles(colors);
  const unlocked = useFeaturesUnlocked();
  // Free: the Day tab (30 days) and this + last month's calendar. Streaks and
  // badges are computed from all the data and are never limited.
  const lockedPeriods = unlocked ? [] : PERIOD_OPTIONS.map((p) => p.key).filter((k) => !isChartPeriodFree(k));
  const habitColor = stats.habit.color ?? DEFAULT_HABIT_COLOR;
  // Quota habits count streaks in weeks; badges compare week × 7 with their days.
  const isQuota = isQuotaSchedule(stats.habit.schedule);
  const streakDays = isQuota ? stats.longestStreak * 7 : stats.longestStreak;
  // Progress to the next badge runs from 0, matching the "days left" text.
  const earnedBadges = STREAK_MILESTONES.filter((m) => streakDays >= m.days);
  const nextBadge = STREAK_MILESTONES.find((m) => streakDays < m.days) ?? null;
  const badgePct = nextBadge ? Math.min(100, Math.round((streakDays / nextBadge.days) * 100)) : 100;
  const todayMonth = new Date();
  const monthsBack = (todayMonth.getFullYear() - calendar.year) * 12 + todayMonth.getMonth() - calendar.month;
  const prevLocked = !unlocked && monthsBack >= FREE_CALENDAR_MONTHS_BACK;
  const monthLabel = new Date(calendar.year, calendar.month, 1).toLocaleDateString(DATE_LOCALE[lang], {
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <View style={styles.headRow}>
        {stats.habit.icon && <HabitIconGlyph id={stats.habit.icon} size={26} color={habitColor} />}
        <Text style={shared.greeting}>{stats.habit.title}</Text>
      </View>
      {subtitle}

      <View style={styles.statsRow}>
        <StatCard
          label={t(isQuota ? 'stats.currentStreakWeeks' : 'stats.currentStreak')}
          value={String(stats.currentStreak)}
          styles={styles}
          icon={<Ionicons name="flame" size={20} color={colors.streak} />}
        />
        <StatCard
          label={t(isQuota ? 'stats.longestStreakWeeks' : 'stats.longestStreak')}
          value={String(stats.longestStreak)}
          styles={styles}
        />
      </View>

      <View style={{ marginTop: 12 }}>
        <HabitDarkStatsCard
          stats={stats}
          habit={stats.habit}
          color={habitColor}
          themeColors={colors}
          lang={lang}
          t={t}
          styles={styles}
          lockedPeriods={lockedPeriods}
          onLocked={() => promptPlus('history', t)}
        />
      </View>

      <View style={[styles.card, { marginTop: 12 }]}>
        <Text style={styles.cardLabel}>{t('stats.calendar')}</Text>
        <View style={[styles.calHead, { marginTop: 12 }]}>
          <Pressable
            onPress={prevLocked ? () => promptPlus('history', t) : calendar.goPrev}
            disabled={!calendar.canGoPrev}
            hitSlop={8}
            style={[styles.calNavBtn, !calendar.canGoPrev && styles.calNavBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={
              prevLocked ? `${t('stats.prevMonthA11y')}. ${t('plus.lockedA11y')}` : t('stats.prevMonthA11y')
            }
          >
            <Feather
              name={prevLocked ? 'lock' : 'chevron-left'}
              size={prevLocked ? 16 : 18}
              color={calendar.canGoPrev ? colors.text : colors.faint}
            />
          </Pressable>
          <Text style={styles.calMonthLabel}>
            {monthLabel.charAt(0).toLocaleUpperCase(DATE_LOCALE[lang]) + monthLabel.slice(1)}
          </Text>
          <Pressable
            onPress={calendar.goNext}
            disabled={!calendar.canGoNext}
            hitSlop={8}
            style={[styles.calNavBtn, !calendar.canGoNext && styles.calNavBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('stats.nextMonthA11y')}
          >
            <Feather name="chevron-right" size={18} color={calendar.canGoNext ? colors.text : colors.faint} />
          </Pressable>
        </View>
        <View style={styles.calWeekHead}>
          {['weekday.mon', 'weekday.tue', 'weekday.wed', 'weekday.thu', 'weekday.fri', 'weekday.sat', 'weekday.sun'].map(
            (k) => (
              <Text key={k} style={styles.calWeekHeadText}>
                {t(k)}
              </Text>
            )
          )}
        </View>
        <MonthCalendar weeks={calendar.weeks} color={habitColor} styles={styles} />
      </View>

      {/* Earned badges (kept even if the streak drops) and progress to the next. */}
      <View style={[styles.card, { marginTop: 12 }]}>
        <Text style={styles.cardLabel}>{t('stats.badges')}</Text>
        {earnedBadges.length > 0 && (
          <View style={[styles.badgeRow, { marginTop: 12 }]}>
            {earnedBadges.map((m) => (
              <View key={m.days} style={styles.badge}>
                <Text style={styles.badgeEmoji}>{m.emoji}</Text>
                <Text style={styles.badgeLabel}>{t(m.labelKey)}</Text>
              </View>
            ))}
          </View>
        )}
        {nextBadge ? (
          <View style={{ marginTop: 12 }}>
            <View style={styles.badgeNextRow}>
              <Text style={styles.badgeNextEmoji}>{nextBadge.emoji}</Text>
              <Text style={styles.badgeNextLabel}>{t(nextBadge.labelKey)}</Text>
              <Text style={styles.badgeNextLeft}>
                {t('date.daysLeft', { n: nextBadge.days - streakDays })}
              </Text>
            </View>
            <View style={styles.badgeTrack}>
              <View style={[styles.badgeFill, { width: `${badgePct}%`, backgroundColor: habitColor }]} />
            </View>
          </View>
        ) : (
          <Text style={[styles.badgeAllEarned, { marginTop: 12 }]}>{t('stats.badgesAllEarned')}</Text>
        )}
      </View>
    </>
  );
}
