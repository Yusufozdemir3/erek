// Habits screen data: today's state, streak and the last 7 days of each habit.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { goalRepo, habitRepo, reminderRepo } from '@/db';
import type { HabitKind } from '@/db';
import { buildScheduleLabels, lastDays, scheduleLabel, todayDate } from '@/lib/helpers';
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
  reminderTimes: string[];
  icon: string | null;
  color: string | null;
  days: string | null;     // "Mon·Wed·Fri"; null = every day
  period: string | null;   // "Jul 5 → Jul 20"
  target: number | null;   // null = binary
  unit: string | null;
  goalTitle: string | null; // the linked goal
  amount: number;          // today
  completedToday: boolean;
  streak: number;
  week: boolean[]; // last 7 days, oldest to today
}

export function useHabitsData(userId: string) {
  // Reloads on dataVersion too (see useTodayData).
  const { dataVersion } = useAppData();
  const { t, lang } = useI18n();
  const today = todayDate();
  const [habits, setHabits] = useState<HabitListItem[]>([]);

  const reload = useCallback(() => {
    const week = lastDays(7);
    const labels = buildScheduleLabels(t, (md) => shortDate(`2000-${md}`, lang));
    const goalTitles = new Map(goalRepo.listByUser(userId).map((g) => [g.id, g.title]));
    const reminderMap = reminderRepo.mapByType('habit');
    // Bulk queries, not two per habit.
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
          streak: habitRepo.currentStreak(h.id, h),
          week: week.map((d) => completed.has(d)),
        };
      })
    );
  }, [userId, today, dataVersion, lang]);

  useFocusEffect(reload);

  return { today, habits, reload };
}
