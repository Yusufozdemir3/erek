// Alışkanlık istatistik ekranının SAF biçimlendiricileri ve dönem sabitleri —
// app/habit/[id].tsx'ten AYRILDI (denetim bulgusu H1). React'e bağlı olmadıkları
// için hızlı 'logic' test projesinde doğrudan test edilebilirler.

import { fmtClock } from '@/lib/helpers';
import type { Habit } from '@/db';
import { DATE_LOCALE } from '@/i18n/dateLocale';
import type { Lang } from '@/i18n/translations';

// Tam sayıysa ondalık gösterme (5, 5.5) — AmountStepper'daki fmt ile aynı kural.
export function fmtAmount(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

// Büyük miktarları kısaltır (24500 -> "24.5k", 1_600_000 -> "1.6M") — Hafta/Ay/Yıl
// hedef toplamları hızla binlere/milyonlara çıkabildiği için (adım sayısı vb.).
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return fmtAmount(n);
}

// Hedef dönemi kartındaki bir değeri (done/goal) alışkanlık türüne göre biçimler:
// zamanlayıcıda saat, nicelde miktar+birim, ikilide düz gün sayısı.
export function fmtGoalValue(habit: Habit, n: number): string {
  if (habit.target_amount == null) return String(Math.round(n));
  if (habit.kind === 'timer') return fmtClock(n);
  return `${fmtCompact(n)}${habit.unit ? ` ${habit.unit}` : ''}`;
}

// "Geçmiş" çubuğundaki değeri biçimler — fmtGoalValue ile AYNI tür ayrımı
// (zamanlayıcıda saat, nicelde miktar) ama birim EKLEMEZ (dar sütunlarda
// aşırı sıkışık görünüyordu, bkz. HistoryBars yorumu). Önceden zamanlayıcı
// alışkanlıklarda da fmtCompact kullanılıyordu — saniye toplamı "5.4k" gibi
// anlamsız bir sayıya dönüşüyordu (kullanıcı geri bildirimi).
export function fmtHistoryValue(habit: Habit, n: number): string {
  if (habit.target_amount == null) return String(Math.round(n));
  if (habit.kind === 'timer') return fmtClock(n);
  return fmtCompact(n);
}

// Gün/Hafta/Ay periyodu — Puan ve Geçmiş bölümlerinin ikisi de kullanır
// (dayRatio tabanlı seri hazır olduğundan, bkz. useHabitStats.HabitChartSeries).
export type ChartPeriod = 'day' | 'week' | 'month';

// Gün/Hafta/Ay seçici — Puan + Geçmiş kartlarının ikisi de aynı üçlü periyot
// desenini kullanır (tek kaynak, tutarlı metin/sıra).
export const PERIOD_OPTIONS: { key: ChartPeriod; labelKey: string }[] = [
  { key: 'day', labelKey: 'stats.periodDay' },
  { key: 'week', labelKey: 'stats.periodWeek' },
  { key: 'month', labelKey: 'stats.periodMonth' },
];
export const PERIOD_UNIT_KEY: Record<ChartPeriod, string> = {
  day: 'stats.unitDay',
  week: 'stats.unitWeek',
  month: 'stats.unitMonth',
};

// "Hedef + Puan + Geçmiş" — Claude Design'da onaylanan mockup'ın (Tur 9, kart
// 9a) BİREBİR portu: tek koyu kart, bölümler arasında ince ayraç. Renkler
// mockup'ın kendi paleti (zemin #0a0a0a, kenarlık #262626, ikincil metin #666/
// #999) — TEK bilinçli fark: mockup'ta sabit teal (#5eead4) olan vurgu rengi
// burada `color` (alışkanlığın kendi rengi) — uygulamanın geri kalanıyla
// (ikon, diğer grafikler) tutarlı kalsın diye dinamik bırakıldı.
// "Puan" — EMA (üstel hareketli ortalama) skoru; hesaplama artık ISINMA
// penceresi dahil useHabitStats.buildSeries içinde yapılıyor (bkz. o
// dosyadaki emaScores/attachScores) — burada yalnız hazır b.score okunur.

// "Geçmiş" bar etiketi: periyoda göre — ay kovasında hep ay adı, hafta
// kovasında yeni bir aya geçen ilk çubukta ay adı (mockup'taki "HAZ·22·29·TEM·13"
// deseni), gün kovasında kısa tarih.
export function historyBarLabel(
  period: ChartPeriod,
  bucketStart: string,
  prevBucketStart: string | null,
  lang: Lang
): string {
  const d = new Date(`${bucketStart}T00:00:00`);
  if (period === 'month') {
    return d.toLocaleDateString(DATE_LOCALE[lang], { month: 'short' }).toUpperCase();
  }
  // 'day' ve 'week': sadece gün numarası, ay değiştiğinde bir kez ay adı da
  // eklenir. ('day' eskiden shortDate ile HER etikette ayı tekrarlıyordu —
  // kullanıcı ekran görüntüsünde yakaladı, bu düzeltme onun için.)
  if (!prevBucketStart || d.getMonth() !== new Date(`${prevBucketStart}T00:00:00`).getMonth()) {
    return d.toLocaleDateString(DATE_LOCALE[lang], { month: 'short' }).toUpperCase();
  }
  return String(d.getDate());
}

// "Geçmiş" çubukları — yatayda KAYDIRILABİLİR (Puan grafiğiyle aynı prensip):
// sabit genişlikli sütunlar, açılışta en güncel kovaya (sağ uca) otomatik
// kayar. Değer etiketinde birim YOK (yalnızca kısaltılmış sayı, ör. "11.4k")
// — dar sütunlarda birim eklemek aşırı sıkışık görünüyordu (kullanıcı geri
// bildirimi); birim zaten başlıkta/"Hedef" bölümünde okunabiliyor.
// Çubuğun İÇİNE yazılan değerin mürekkep rengi: alışkanlık rengi kullanıcı
// seçimi olduğu için sabit koyu/açık yazı her palette okunmuyor — zeminin
// parlaklığına göre seçilir (BT.601).
export function inkOn(hex: string): string {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return '#0a0a0a';
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0a0a0a' : '#ffffff';
}
