// Hedef ekranlarının SAF biçimlendiricileri — app/goal/[id].tsx'ten AYRILDI.
// React'e bağlı olmadıkları için hızlı 'logic' test projesinde doğrudan test
// edilebilirler (lib/timerLogic.ts, lib/goalProjection.ts ile aynı gerekçe).

import { fmtClock, isTimeUnit } from '@/lib/helpers';
import { DATE_LOCALE } from '@/ui/theme';

// Tam sayıysa ondalık gösterme, değilse 1 ondalık (AmountStepper'daki fmt ile aynı desen).
export function fmtAmount(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

// Bir hedef değerini birimine göre biçimlendirir — süre-ölçümlü hedefte (bkz.
// helpers.TIME_UNIT) saniye cinsinden saklanan değeri saat:dakika:saniye olarak
// gösterir; aksi halde sayı+serbest birim metni (eski davranış). Ham "__time__"
// işaretinin asla ekranda ham metin olarak sızmaması için TÜM unit gösterimleri
// buradan geçmeli.
export function fmtGoalValue(n: number, unit: string | null): string {
  return isTimeUnit(unit) ? fmtClock(n) : `${fmtAmount(n)}${unit ? ` ${unit}` : ''}`;
}

// Girdi geçmişi satırı için tarih+saat ("15 Tem, 14:32").
export function fmtEntryWhen(iso: string, lang: 'tr' | 'en' | 'de'): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(DATE_LOCALE[lang], { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(DATE_LOCALE[lang], { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}
