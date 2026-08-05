// Hedef ekranlarının SAF biçimlendiricileri — app/goal/[id].tsx'ten AYRILDI.
// React'e bağlı olmadıkları için hızlı 'logic' test projesinde doğrudan test
// edilebilirler (lib/timerLogic.ts, lib/goalProjection.ts ile aynı gerekçe).

import { fmtClock, isTimeUnit } from '@/lib/helpers';
import { dateTimeLabel } from '@/ui/theme';

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

// Girdi geçmişi satırı için tarih+saat ("15 Tem, 14:32"). Uygulamadaki tek
// tarih+saat biçimi olduğu için gövdesi diğer tarih etiketlerinin yanına
// (ui/theme.ts) taşındı; bu ad hedef ekranının sözlüğünde kalsın diye duruyor.
export function fmtEntryWhen(iso: string, lang: 'tr' | 'en' | 'de'): string {
  return dateTimeLabel(iso, lang);
}
