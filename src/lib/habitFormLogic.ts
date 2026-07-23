// HabitForm'un SAF dönüşümleri — form durumundan (metin kutuları, kip seçimleri)
// veritabanı alanlarına giden hesaplar. src/ui/HabitForm.tsx'in submit'inin
// içinde gömülüydü: 980 satırlık bir bileşenin ortasında, hiçbir testin
// göremediği yerde (denetim bulgusu H1 + F1). React'e bağlı olmadıkları için
// buraya alındılar (lib/timerLogic.ts, lib/goalProjection.ts ile aynı gerekçe).
//
// ORTAK KURAL: geçersiz/boş girdi HATA DEĞİL, güvenli varsayılana düşer —
// kullanıcı yarım bıraktığı bir alan yüzünden kaydetmekten alıkonmaz.

import { todayDate } from '@/lib/helpers';
import type { HabitKind, Recurrence } from '@/db';

// Formdaki dört sıklık kipi. 'daily' = her gün (Recurrence null'a karşılık gelir).
export type FreqMode = 'daily' | 'days' | 'interval' | 'quota';

export interface ScheduleInput {
  freqMode: FreqMode;
  weekdays: number[]; // 'days' kipinde seçili günler (0=Pazar)
  everyNText: string; // 'interval' kipinde "kaç günde bir"
  quotaText: string; // 'quota' kipinde "haftada kaç kez"
  startDate: string | null; // 'interval' çapası için (yoksa bugün)
  previousSchedule: Recurrence | null; // düzenlemede mevcut çapa korunsun diye
}

// Sıklık kipini Recurrence'a çevirir. Geçersiz/boş girdiler "her gün"e (null)
// düşer: belirli günlerde hiç gün seçilmemişse, aralıkta sayı < 2 ise, kotada
// sayı 1-7 dışındaysa.
export function buildSchedule(input: ScheduleInput): Recurrence | null {
  const { freqMode, weekdays, everyNText, quotaText, startDate, previousSchedule } = input;

  if (freqMode === 'days' && weekdays.length > 0) {
    return { freq: 'weekly', weekdays: [...weekdays].sort((a, b) => a - b) };
  }

  if (freqMode === 'interval') {
    const n = parseInt(everyNText, 10);
    if (Number.isFinite(n) && n >= 2) {
      // Çapa (referans günü): düzenlemede mevcut çapa korunur ki planlı günler
      // kaymasın; oluşturmada başlangıç tarihi (yoksa bugün) çapadır.
      const anchor =
        previousSchedule?.freq === 'interval' && previousSchedule.anchor
          ? previousSchedule.anchor
          : (startDate ?? todayDate());
      return { freq: 'interval', every: n, anchor };
    }
    return null;
  }

  if (freqMode === 'quota') {
    const n = parseInt(quotaText, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 7) {
      return { freq: 'weekly', timesPerWeek: n };
    }
  }

  return null;
}

// Hedef/birim tipe göre: numeric = miktar+birim, timer = DAKİKA girilir SANİYE
// saklanır (habit_logs.amount da saniye biriktirir), binary = ikisi de null.
export function buildTarget(
  kind: HabitKind,
  targetText: string,
  unit: string
): { target_amount: number | null; unit: string | null } {
  const parsed = parseFloat(targetText.replace(',', '.'));
  if (kind === 'numeric') {
    const target_amount = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    return { target_amount, unit: target_amount != null && unit.trim() ? unit.trim() : null };
  }
  if (kind === 'timer') {
    return {
      target_amount: Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 60) : null,
      unit: null,
    };
  }
  return { target_amount: null, unit: null };
}

// Kullanıcı "kaç {alışkanlık birimi} bir {hedef birimi} eder" oranını girer
// (ör. 4 sayfa = 1 bölüm); DB'de saklanan goal_factor bunun TERSİDİR (0.25 —
// hedefe eklenecek gerçek çarpan). Geçersiz girdi 1'e düşer (birebir katkı).
export function ratioToGoalFactor(ratioText: string): number {
  const parsed = parseFloat(ratioText.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? 1 / parsed : 1;
}

// Bitiş başlangıçtan önce olamaz; olduysa başlangıca çekilir (tek günlük aralık).
export function clampEndDate(startDate: string | null, endDate: string | null): string | null {
  return endDate && startDate && endDate < startDate ? startDate : endDate;
}
