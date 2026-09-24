// Data loading logic for the "Habits" screen: today's status, streak, and the
// last 7 days' history for each habit. Kept separate from the screen so
// habits.tsx stays responsible only for rendering.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { goalRepo, habitRepo, reminderRepo } from '@/db';
import type { HabitKind } from '@/db';
import { buildScheduleLabels, isQuotaSchedule, lastDays, scheduleLabel, todayDate } from '@/lib/helpers';
import { useAppData } from '@/ui/AppData';
import { useI18n } from '@/i18n/I18nProvider';
import type { Lang } from '@/i18n/translations';
import { shortDate } from '@/ui/theme';

// "Jul 5 → Jul 20" / "Jul 5 →" / "→ Jul 20"; null if both are empty.
function periodLabel(start: string | null, end: string | null, lang: Lang): string | null {
  if (!start && !end) return null;
  return `${start ? shortDate(start, lang) : ''} → ${end ? shortDate(end, lang) : ''}`.trim();
}

export interface HabitListItem {
  id: string;
  title: string;
  kind: HabitKind;
  reminderTimes: string[]; // "HH:MM" reminder times (0 or more)
  icon: string | null;
  color: string | null;
  days: string | null;     // "Mon·Wed·Fri" (if specific days), null if every day
  period: string | null;   // "Jul 5 → Jul 20" (if start/end set), otherwise null
  target: number | null;   // numeric target; null = binary
  unit: string | null;
  goalTitle: string | null; // linked goal's title (if any), otherwise null
  amount: number;          // amount done today
  completedToday: boolean;
  streak: number;
  week: boolean[]; // last 7 days, oldest to today
}

export function useHabitsData(userId: string) {
  // dataVersion: increments when something is added via the central ＋ menu (see useTodayData).
  const { dataVersion } = useAppData();
  const { t, lang } = useI18n();
  const today = todayDate();
  const [habits, setHabits] = useState<HabitListItem[]>([]);

  const reload = useCallback(() => {
    const week = lastDays(7);
    const labels = buildScheduleLabels(t, (md) => shortDate(`2000-${md}`, lang));
    // Map linked goal titles in a single query (no separate query per habit).
    const goalTitles = new Map(goalRepo.listByUser(userId).map((g) => [g.id, g.title]));
    // Collect reminder times in a single query (no separate query per habit).
    const reminderMap = reminderRepo.mapByType('habit');
    // TODAY's status and the WEEK strip are now just TWO queries total instead
    // of two per habit: it used to fire recentLogs + getAmountOn per habit, an
    // N+1 that grew linearly with the list and re-ran from scratch on every toggle.
    const list = habitRepo.listByUser(userId);
    const ids = list.map((h) => h.id);
    const dayStates = habitRepo.getDayStates(ids, today);
    const weekCompleted = habitRepo.completedDatesBetween(ids, week[0], today);
    setHabits(
      list.map((h) => {
        const completed = weekCompleted[h.id] ?? new Set<string>();
        const state = dayStates[h.id];
        return {
          id: h.id,
          title: h.title,
          kind: h.kind,
          reminderTimes: (reminderMap.get(h.id) ?? []).map((r) => r.time),
          icon: h.icon,
          color: h.color,
          days: h.schedule ? scheduleLabel(h.schedule, labels) : null,
          period: periodLabel(h.start_date, h.end_date, lang),
          target: h.target_amount,
          unit: h.unit,
          goalTitle: h.goal_id ? goalTitles.get(h.goal_id) ?? null : null,
          amount: state?.amount ?? 0,
          completedToday: state?.completed ?? false,
          // We already have the habit — skip currentStreak's own getById.
          streak: habitRepo.currentStreak(h.id, h),
          week: week.map((d) => completed.has(d)),
        };
      })
    );
  }, [userId, today, dataVersion, lang]);

  useFocusEffect(reload);

  return { today, habits, reload };
}
