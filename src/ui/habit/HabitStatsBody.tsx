// The habit stats screen body: title, streak cards, Goal/Score/History card,
// month calendar and badges. Presentational only — the local screen
// (app/habit/[id].tsx) and a friend's shared habit (app/shared-habit/[id].tsx)
// feed it the same HabitStats/HabitCalendar shapes from different sources.

import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Feather } from '@expo/vector-icons';
import { isQuotaSchedule } from '@/lib/helpers';
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
  const habitColor = stats.habit.color ?? DEFAULT_HABIT_COLOR;
  // For a quota habit (X times a week), streaks are counted in WEEKS: the
  // label/unit differs, and badge thresholds (in days) are compared against week×7.
  const isQuota = isQuotaSchedule(stats.habit.schedule);
  const streakDays = isQuota ? stats.longestStreak * 7 : stats.longestStreak;
  // Earned badges + the next threshold. Progress is measured from 0 to the next
  // threshold (not from the previous one): the same linear scale as the "days
  // left" number, so the bar and the text agree with each other.
  const earnedBadges = STREAK_MILESTONES.filter((m) => streakDays >= m.days);
  const nextBadge = STREAK_MILESTONES.find((m) => streakDays < m.days) ?? null;
  const badgePct = nextBadge ? Math.min(100, Math.round((streakDays / nextBadge.days) * 100)) : 100;
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
        {/* "Completion %" REMOVED: being a lifetime average, it froze as
            the habit aged (neither a good nor a bad week could move it) —
            the EMA in the Score card answers the same question with a
            trend, and having both side by side was confusing. */}
      </View>

      {/* Goal/Score/History — a single dark card (ported from the Claude
          Design mockup, see HabitDarkStatsCard). */}
      <View style={{ marginTop: 12 }}>
        <HabitDarkStatsCard
          stats={stats}
          habit={stats.habit}
          color={habitColor}
          themeColors={colors}
          lang={lang}
          t={t}
          styles={styles}
        />
      </View>

      {/* "Streak history" (top 3 longest streaks) REMOVED: the summary
          above already gives the current + longest streak, and that
          section only added the 2nd and 3rd longest; the Calendar right
          below shows the same history far more richly. The remaining
          sections each sit in their own `styles.card` box — the stat
          blocks on screen are CONSISTENTLY boxed/separated. */}

      {/* Full calendar — navigable month by month. */}
      <View style={[styles.card, { marginTop: 12 }]}>
        <Text style={styles.cardLabel}>{t('stats.calendar')}</Text>
        <View style={[styles.calHead, { marginTop: 12 }]}>
          <Pressable
            onPress={calendar.goPrev}
            disabled={!calendar.canGoPrev}
            hitSlop={8}
            style={[styles.calNavBtn, !calendar.canGoPrev && styles.calNavBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('stats.prevMonthA11y')}
          >
            <Feather name="chevron-left" size={18} color={calendar.canGoPrev ? colors.text : colors.faint} />
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

      {/* Badges — counted as earned once the longest streak clears the
          threshold (the medal stays even if the streak later drops). It
          used to show ALL 4 thresholds at once, with locked ones faded:
          that content was already derivable from the "Longest streak"
          number above, and it greeted a new user with 4 faded medals.
          Now it's just the earned ones + a progress bar toward the NEXT
          threshold — the message shifted from "what you haven't done" to
          "almost there" (same language as the Goal card on this screen). */}
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
