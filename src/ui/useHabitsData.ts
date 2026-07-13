// "Alışkanlıklar" ekranının veri yükleme mantığı: her alışkanlık için bugünkü
// durum, seri ve son 7 günün geçmişi. Ekrandan ayrı tutulur ki habits.tsx
// yalnızca render'dan sorumlu kalsın.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { goalRepo, habitRepo } from '@/db';
import type { HabitKind } from '@/db';
import { lastDays, scheduleLabel, todayDate } from '@/lib/helpers';
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
  remindAt: string | null; // "HH:MM" hatırlatma saati
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
    // JS getDay() sırasıyla (0=Pazar...6=Cumartesi) çevrilmiş gün etiketleri.
    const dayLabels = [
      t('weekday.sun'), t('weekday.mon'), t('weekday.tue'), t('weekday.wed'),
      t('weekday.thu'), t('weekday.fri'), t('weekday.sat'),
    ];
    const everyDayLabel = t('habit.everyDay');
    // Bağlı hedef başlıklarını tek sorguda map'le (alışkanlık başına ayrı sorgu yok).
    const goalTitles = new Map(goalRepo.listByUser(userId).map((g) => [g.id, g.title]));
    setHabits(
      habitRepo.listByUser(userId).map((h) => {
        // Son 60 günün tamamlanan tarihlerini tek sorguda topla, haftayı ondan üret.
        const completed = new Set(
          habitRepo
            .recentLogs(h.id, 60)
            .filter((l) => l.completed === 1)
            .map((l) => l.log_date)
        );
        return {
          id: h.id,
          title: h.title,
          kind: h.kind,
          remindAt: h.remind_at,
          icon: h.icon,
          color: h.color,
          days: h.schedule ? scheduleLabel(h.schedule, everyDayLabel, dayLabels) : null,
          period: periodLabel(h.start_date, h.end_date, lang),
          target: h.target_amount,
          unit: h.unit,
          goalTitle: h.goal_id ? goalTitles.get(h.goal_id) ?? null : null,
          amount: habitRepo.getAmountOn(h.id, today),
          completedToday: completed.has(today),
          streak: habitRepo.currentStreak(h.id),
          week: week.map((d) => completed.has(d)),
        };
      })
    );
  }, [userId, today, dataVersion, lang]);

  useFocusEffect(reload);

  return { today, habits, reload };
}
