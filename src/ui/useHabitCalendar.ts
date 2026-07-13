// Alışkanlık istatistik ekranındaki "tam takvim" bölümünün veri/gezinme
// mantığı. Ay ay ileri/geri gidilebilir (yalnız geçmişe; gelecek aya
// gidilemez). Her ay için Pazartesi başlangıçlı 7 sütunluk hafta ızgarası
// üretir; ay dışı hücreler null (dolgu).
//
// BİLİNEN SINIR: Habit tablosunda gerçek "oluşturulma tarihi" alanı yok
// (start_date boşsa "baştan beri" anlamına gelir, ne zaman baştan bilinmez).
// Bu yüzden start_date'i olmayan bir alışkanlıkta çok eskiye gidildiğinde,
// alışkanlık henüz var olmadan önceki günler de "planlı ama kaçırılmış"
// (kırmızı) görünebilir — mevcut 90 günlük ısı haritasında da aynı sınır var,
// burada yalnız daha görünür hale gelebilir. Bunu tamamen önlemek yeni bir
// created_at alanı (şema migration'ı) gerektirir; şimdilik gezinme son 24 ayla
// sınırlanarak etkisi azaltılıyor.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { habitRepo } from '@/db';
import type { Habit } from '@/db';
import { isScheduledOn, isWithinHabitDates, todayDate, WEEKDAY_DISPLAY_ORDER } from '@/lib/helpers';

const MAX_MONTHS_BACK = 24;

export interface CalendarDay {
  date: string;
  scheduled: boolean;
  completed: boolean;
  future: boolean; // bugünden sonrası — "kaçırıldı" değil, henüz yaşanmadı
}

export interface HabitCalendar {
  habit: Habit | null;
  year: number;
  month: number; // 0-11 (JS Date ayı)
  weeks: (CalendarDay | null)[][]; // her hafta 7 hücre (Pzt..Paz); ay dışı = null
  canGoPrev: boolean;
  canGoNext: boolean;
  goPrev: () => void;
  goNext: () => void;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

// JS getDay() (0=Pazar..6=Cumartesi) -> Pazartesi başlangıçlı sütun (0..6).
function mondayFirstIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

export function useHabitCalendar(habitId: string): HabitCalendar {
  const [monthOffset, setMonthOffset] = useState(0); // 0 = içinde bulunulan ay
  const [habit, setHabit] = useState<Habit | null>(null);
  const [weeks, setWeeks] = useState<(CalendarDay | null)[][]>([]);

  const today = todayDate();
  const now = new Date(`${today}T00:00:00`);
  const base = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = base.getFullYear();
  const month = base.getMonth();

  const reload = useCallback(() => {
    const h = habitRepo.getById(habitId);
    setHabit(h);
    if (!h) {
      setWeeks([]);
      return;
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDate = ymd(year, month, 1);
    const lastDate = ymd(year, month, daysInMonth);
    const logs = habitRepo.logsBetween(habitId, firstDate, lastDate);
    const completedDates = new Set(logs.filter((l) => l.completed === 1).map((l) => l.log_date));

    const cells: CalendarDay[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = ymd(year, month, day);
      const scheduled =
        isScheduledOn(h.schedule, date) && isWithinHabitDates(h.start_date, h.end_date, date);
      cells.push({
        date,
        scheduled,
        completed: completedDates.has(date),
        future: date > today,
      });
    }

    // Ayın 1'inin haftadaki yerine göre baştan dolgu (null) ekle; 7'nin katına
    // tamamlanana kadar sondan da dolgu ekle.
    const leadPad = mondayFirstIndex(new Date(year, month, 1).getDay());
    const grid: (CalendarDay | null)[] = [
      ...Array(leadPad).fill(null),
      ...cells,
    ];
    while (grid.length % 7 !== 0) grid.push(null);

    const built: (CalendarDay | null)[][] = [];
    for (let i = 0; i < grid.length; i += 7) built.push(grid.slice(i, i + 7));
    setWeeks(built);
  }, [habitId, year, month]);

  useFocusEffect(reload);

  return {
    habit,
    year,
    month,
    weeks,
    canGoPrev: monthOffset > -MAX_MONTHS_BACK,
    canGoNext: monthOffset < 0,
    goPrev: () => setMonthOffset((o) => Math.max(-MAX_MONTHS_BACK, o - 1)),
    goNext: () => setMonthOffset((o) => Math.min(0, o + 1)),
  };
}
