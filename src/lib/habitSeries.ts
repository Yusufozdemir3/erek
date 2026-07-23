// Puan grafiğinin VERİ ÜRETİMİ — saf fonksiyon, React'e/expo-router'a bağlı
// değil (timerLogic.ts / goalProjection.ts / habitScore.ts ile aynı gerekçe:
// hızlı 'logic' test projesinde koşabilsin). useHabitStats bunu çağırır.
//
// MODEL (kullanıcı kararı 2026-07-23): grafik SADECE DEVAMLILIĞI gösterir.
//   - Üç alışkanlık tipinde de tek soru: o gün TAMAMLANDI MI? (kısmi kredi yok)
//   - Puan 0'dan başlar, adım adım yükselir, adım adım düşer (bkz. habitScore.ts)
//   - Plansız gün NÖTR: kova dizide kalır (çizgi kesintisiz akar) ama puanı
//     ne yükseltir ne düşürür.

import type { Habit, HabitLog } from '@/db';
import {
  isQuotaSchedule,
  isScheduledOn,
  isWithinHabitDates,
  lastDays,
  todayDate,
  toYmd,
  weekStartOf,
} from '@/lib/helpers';
import {
  SCORE_EMA_ALPHA,
  SCORE_EMA_ALPHA_MONTH,
  SCORE_EMA_ALPHA_WEEK,
  emaScores,
} from '@/lib/habitScore';

const DAY_BUCKETS = 30;
const WEEK_BUCKETS = 12;
const MONTH_BUCKETS = 12;
// Puan (EMA) ISINMA penceresi — gösterilecek aralıktan ÖNCE, yalnızca EMA'yı
// beslemek için ekstra kova. Bunlar ekranda görünmez, yalnız ilk görünür
// noktanın da öncesindeki birikimi yansıtmasını sağlar.
const DAY_WARMUP = 60;
const WEEK_WARMUP = 12;
const MONTH_WARMUP = 12;

// Grafik kovası: date = kovanın başlangıç günü ("YYYY-MM-DD"),
// score = kovanın EMA'lı puanı — Puan grafiği bunu çizer. partial=true ise kova
// henüz BİTMEDİ (bugün / süren hafta-ay) — grafikte soluk gösterilir.
export interface ChartBucket {
  date: string;
  // 0..1 ham oran; null = NÖTR kova (o aralıkta planlı gün yok). Nötr kova puanı
  // ne yükseltir ne düşürür — "bugün onun günü değildi" bir başarısızlık değil.
  // Kova yine de dizide kalır ki çizgi kesintisiz aksın (bkz. habitScore.ts).
  ratio: number | null;
  score: number;
  partial: boolean;
}

// Gün/hafta/ay serileri — istatistik ekranındaki puan grafiğinin üç görünümü.
export interface HabitChartSeries {
  day: ChartBucket[];
  week: ChartBucket[];
  month: ChartBucket[];
}

// Puan grafiği ÜÇ ALIŞKANLIK TİPİNDE DE aynı soruyu sorar: o gün tamamlandı mı,
// tamamlanmadı mı. İkili/nicel/zamanlayıcı ayrımı yok — nicel ve zamanlayıcıda
// `completed` zaten "günlük hedefe ulaşıldı" demektir (habitRepo.incrementAmount
// onu amount >= target olunca 1 yapar).
//
// Eskiden nicel/zamanlayıcıda KISMİ kredi vardı (amount/target): 8 bardaktan 5'i
// içildiyse gün 0.625 sayılıyordu. İki sorun: (1) tip başına farklı davranan bir
// puan, (2) aynı gün Hafta/Ay kovasında 0 sayılıyordu (rangeRatio yalnız
// completed=1'e bakar) — yani Gün sekmesiyle çelişiyordu.
function dayRatio(log: HabitLog | undefined): number {
  return log?.completed === 1 ? 1 : 0;
}

// İki tarih (dahil) arasındaki planlı gün / tamamlanan gün oranı.
// Gelecek günler sayılmaz (henüz yaşanmadı). Aralıkta HİÇ planlı gün yoksa null
// döner = nötr kova (alışkanlık o dönemde ya henüz başlamamış, ya bitmiş, ya da
// hiçbir günü o aralığa düşmüyor) — puanı düşürmemeli.
// KOTA (haftada X kez) kuralında payda gün başına kota/7'dir — tam bir haftada
// tam kota, kısmi aralıkta oransal (hafta sınırı gözetmeyen yaklaşıklık).
function rangeRatio(
  habit: Habit,
  completedSet: Set<string>,
  startYmd: string,
  endYmd: string,
  today: string
): number | null {
  const quota = isQuotaSchedule(habit.schedule) ? habit.schedule!.timesPerWeek! : null;
  let scheduled = 0;
  let done = 0;
  let quotaDays = 0;
  const cursor = new Date(`${startYmd}T00:00:00`);
  const end = new Date(`${endYmd}T00:00:00`);
  while (cursor <= end) {
    const ymd = toYmd(cursor);
    if (ymd > today) break;
    if (isScheduledOn(habit.schedule, ymd) && isWithinHabitDates(habit.start_date, habit.end_date, ymd)) {
      if (quota) quotaDays++;
      else scheduled++;
      if (completedSet.has(ymd)) done++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (quota) {
    const expected = (quota * quotaDays) / 7;
    return expected > 0 ? Math.min(1, done / expected) : null;
  }
  return scheduled > 0 ? done / scheduled : null;
}

// Serinin başındaki, alışkanlığın doğumundan (ilk log / start_date) tümüyle
// önce biten boş kovaları at — yeni bir alışkanlıkta 10 ay boş çubuk gösterme.
function trimLeading(buckets: ChartBucket[], bucketEndOf: (b: ChartBucket) => string, firstDate: string): ChartBucket[] {
  let i = 0;
  while (i < buckets.length - 1 && bucketEndOf(buckets[i]) < firstDate) i++;
  return buckets.slice(i);
}

export function buildSeries(habit: Habit, allLogs: HabitLog[]): HabitChartSeries | null {
  if (allLogs.length === 0) return null;
  const today = todayDate();
  const logByDate = new Map(allLogs.map((l) => [l.log_date, l]));
  const completedSet = new Set(allLogs.filter((l) => l.completed === 1).map((l) => l.log_date));
  const firstLogDate = allLogs[0].log_date;
  const firstDate = habit.start_date && habit.start_date < firstLogDate ? habit.start_date : firstLogDate;
  const quota = isQuotaSchedule(habit.schedule) ? habit.schedule!.timesPerWeek! : null;

  // — Gün: kova = tek gün. KOTA (haftada X kez) alışkanlıkta günün HAM 0/1
  // durumu yerine "bu haftanın bugüne kadarki oranı" kullanılır — aksi halde
  // haftalık kotasını tutturan bir alışkanlık bile Gün sekmesinde sürekli
  // düşük puanlı görünürdü (Hafta/Ay sekmeleriyle çelişen, yanıltıcı bir
  // görünüm — kullanıcı geri bildirimi).
  //
  // Planlı OLMAYAN gün (ya da başlangıç/bitiş aralığı dışındaki gün) 0 değil
  // NÖTR (null): eskiden Pzt/Çar/Cum planlı ve hiç kaçırılmamış bir alışkanlık
  // Gün sekmesinde %42,7 gösteriyordu — çünkü haftanın diğer 4 günü "yapmadın"
  // sayılıyordu — oysa aynı ekranın Hafta/Ay sekmeleri %100 diyordu (rangeRatio
  // plansız günü paydaya almaz). Kova diziden ATILMAZ, nötr geçer: çizgi o
  // günlerde yatay akar, x ekseni günlük kalır.
  const dayDates = lastDays(DAY_BUCKETS + DAY_WARMUP);
  const dayRaw: ChartBucket[] = dayDates.map((date) => {
    const ratio = quota
      ? rangeRatio(habit, completedSet, weekStartOf(date), date, today)
      : isScheduledOn(habit.schedule, date) && isWithinHabitDates(habit.start_date, habit.end_date, date)
        ? dayRatio(logByDate.get(date))
        : null;
    return { date, ratio, score: 0, partial: date === today };
  });

  // — Hafta: kova = hafta (Pazartesi başlangıçlı) —
  const weekRaw: ChartBucket[] = [];
  const monday = new Date(`${today}T00:00:00`);
  const jsDay = monday.getDay(); // 0=Pazar
  monday.setDate(monday.getDate() - ((jsDay + 6) % 7)); // bu haftanın pazartesisi
  for (let i = WEEK_BUCKETS + WEEK_WARMUP - 1; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const startYmd = toYmd(start);
    const endYmd = toYmd(end);
    weekRaw.push({
      date: startYmd,
      ratio: rangeRatio(habit, completedSet, startYmd, endYmd, today),
      score: 0,
      partial: endYmd > today,
    });
  }

  // — Ay: kova = takvim ayı —
  const monthRaw: ChartBucket[] = [];
  const now = new Date(`${today}T00:00:00`);
  for (let i = MONTH_BUCKETS + MONTH_WARMUP - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0); // ayın son günü
    const startYmd = toYmd(start);
    const endYmd = toYmd(end);
    monthRaw.push({
      date: startYmd,
      ratio: rangeRatio(habit, completedSet, startYmd, endYmd, today),
      score: 0,
      partial: endYmd > today,
    });
  }

  const endOfDay = (b: ChartBucket) => b.date;
  const endOfWeek = (b: ChartBucket) => {
    const d = new Date(`${b.date}T00:00:00`);
    d.setDate(d.getDate() + 6);
    return toYmd(d);
  };
  const endOfMonth = (b: ChartBucket) => {
    const d = new Date(`${b.date}T00:00:00`);
    return toYmd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  };

  // Puan 0'dan başlar ve kazanılır (bkz. habitScore.ts). Kesme (trimLeading)
  // artık yalnız GÖRÜNÜM içindir — doğumdan önceki sıfırlar puanı zaten 0'da
  // tutardı, yani matematiği değiştirmiyor; amaç 10 ay boş kova göstermemek.
  // Alpha kova boyuna göre değişir ki üç sekme aynı takvim hızında sönümlensin.
  const attachScores = (raw: ChartBucket[], alpha: number): ChartBucket[] => {
    const scores = emaScores(raw.map((b) => b.ratio), alpha);
    return raw.map((b, i) => ({ ...b, score: scores[i] }));
  };

  return {
    day: attachScores(trimLeading(dayRaw, endOfDay, firstDate), SCORE_EMA_ALPHA).slice(-DAY_BUCKETS),
    week: attachScores(trimLeading(weekRaw, endOfWeek, firstDate), SCORE_EMA_ALPHA_WEEK).slice(-WEEK_BUCKETS),
    month: attachScores(trimLeading(monthRaw, endOfMonth, firstDate), SCORE_EMA_ALPHA_MONTH).slice(-MONTH_BUCKETS),
  };
}
