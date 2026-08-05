// "Alışkanlıklar" ekranının veri yükleme mantığı: her alışkanlık için bugünkü
// durum, seri ve son 7 günün geçmişi. Ekrandan ayrı tutulur ki habits.tsx
// yalnızca render'dan sorumlu kalsın.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { goalRepo, habitRepo, reminderRepo } from '@/db';
import type { HabitKind } from '@/db';
import { buildScheduleLabels, isQuotaSchedule, lastDays, scheduleLabel, todayDate } from '@/lib/helpers';
import { useAppData } from '@/ui/AppData';
import { useI18n } from '@/i18n/I18nProvider';
import type { Lang } from '@/i18n/translations';
import { shortDate } from '@/ui/theme';

// "5 Tem → 20 Tem" / "5 Tem →" / "→ 20 Tem"; ikisi de boşsa null.
function periodLabel(start: string | null, end: string | null, lang: Lang): string | null {
  if (!start && !end) return null;
  return `${start ? shortDate(start, lang) : ''} → ${end ? shortDate(end, lang) : ''}`.trim();
}

export interface HabitListItem {
  id: string;
  title: string;
  kind: HabitKind;
  reminderTimes: string[]; // "HH:MM" hatırlatma saatleri (0 ya da daha fazla)
  icon: string | null;
  color: string | null;
  days: string | null;     // "Pzt·Çar·Cum" (belirli günlerse), her günse null
  period: string | null;   // "5 Tem → 20 Tem" (başlangıç/bitiş varsa), yoksa null
  target: number | null;   // nicel hedef; null = ikili
  unit: string | null;
  goalTitle: string | null; // bağlı hedefin başlığı (varsa), yoksa null
  amount: number;          // bugün yapılan miktar
  completedToday: boolean;
  streak: number;
  week: boolean[]; // son 7 gün, en eskiden bugüne
}

export function useHabitsData(userId: string) {
  // dataVersion: merkezi ＋ menüsünden ekleme yapılınca artar (bkz. useTodayData).
  const { dataVersion } = useAppData();
  const { t, lang } = useI18n();
  const today = todayDate();
  const [habits, setHabits] = useState<HabitListItem[]>([]);

  const reload = useCallback(() => {
    const week = lastDays(7);
    const labels = buildScheduleLabels(t, (md) => shortDate(`2000-${md}`, lang));
    // Bağlı hedef başlıklarını tek sorguda map'le (alışkanlık başına ayrı sorgu yok).
    const goalTitles = new Map(goalRepo.listByUser(userId).map((g) => [g.id, g.title]));
    // Hatırlatma saatlerini tek sorguda topla (alışkanlık başına ayrı sorgu yok).
    const reminderMap = reminderRepo.mapByType('habit');
    // O GÜNÜN durumu ve HAFTANIN şeridi artık ikişer değil TOPLAM iki sorgu:
    // eskiden alışkanlık başına recentLogs + getAmountOn atılıyordu, yani liste
    // uzadıkça doğrusal büyüyen bir N+1 vardı ve her işaretlemede baştan koşuyordu.
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
          // Alışkanlık elimizde — currentStreak'in kendi getById'sini atlıyoruz.
          streak: habitRepo.currentStreak(h.id, h),
          week: week.map((d) => completed.has(d)),
        };
      })
    );
  }, [userId, today, dataVersion, lang]);

  useFocusEffect(reload);

  return { today, habits, reload };
}
