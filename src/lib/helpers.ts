// Repository'lerin paylaştığı küçük yardımcılar.

import * as Crypto from 'expo-crypto';
import type { Recurrence } from '../types/models';

// Cihazda UUID üretir. Offline'da bile çakışmayan ID için kritik.
export function newId(): string {
  return Crypto.randomUUID();
}

// Şu anın ISO 8601 zaman damgası. updated_at için kullanılır.
export function nowIso(): string {
  return new Date().toISOString();
}

// Date -> "YYYY-MM-DD" (yerel saat dilimine göre). Takvim seçicilerin ortak
// çıktı biçimi; ekranlarda ayrı ayrı tekrarlanmasın diye burada tek yerde.
export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Bugünün tarihi "YYYY-MM-DD" formatında (alışkanlık logları için).
// Yerel saat dilimine göre - kullanıcının "bugün"ü neyse o.
export function todayDate(): string {
  return toYmd(new Date());
}

// Date -> "08:30" (saat:dakika). Saat seçicilerin ortak çıktı biçimi.
export function toHm(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// "08:30" -> bugünün o saatine ayarlı bir Date (saat seçicinin başlangıç değeri).
// null verilirse şimdiki saat.
export function hmToDate(hm: string | null): Date {
  const d = new Date();
  if (hm) {
    const [h, m] = hm.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

// Bir tarih-saat metninde ("YYYY-MM-DDTHH:MM..." gibi) saat bileşeni var mı?
// Görev son tarihi saatsiz ("YYYY-MM-DD") ya da saatli olabilir; ekranlar bu
// ayrımı bu fonksiyonla yapar.
export function extractTime(value: string | null): string | null {
  if (!value || value.length < 16 || value[10] !== 'T') return null;
  return value.slice(11, 16);
}

// Saniye -> "M:SS" ya da saatliyse "H:MM:SS" saat/kronometre etiketi.
// Zamanlayıcı alışkanlıkta hem hedef hem ilerleme bu biçimde gösterilir.
export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
}

// Bugün dahil son `count` günün "YYYY-MM-DD" listesi (en eskiden bugüne).
// Haftalık geçmiş şeridi ve istatistik ısı haritası ortak kullanır.
export function lastDays(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const day = new Date(d);
    day.setDate(d.getDate() - i);
    out.push(toYmd(day));
  }
  return out;
}

// JSON alanları güvenli parse/stringify (recurrence gibi).
export function parseJson<T>(value: string | null): T | null {
  if (value == null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function toJson(value: unknown): string | null {
  if (value == null) return null;
  return JSON.stringify(value);
}

// Görüntüleme sırası: Pazartesi'den Pazar'a (JS getDay() değerleri; dile bağlı değil).
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Verilen gün alışkanlığın yaşam aralığında mı? null start = baştan beri,
// null end = süresiz. Aralık dışı günler "planlı değil" muamelesi görür:
// görünmez, streak'i ne besler ne bozar. "YYYY-MM-DD" metin karşılaştırması
// kronolojik sıralamayla birebir aynı olduğundan Date'e çevirmeye gerek yok.
export function isWithinHabitDates(
  start: string | null,
  end: string | null,
  dateYmd: string
): boolean {
  if (start && dateYmd < start) return false;
  if (end && dateYmd > end) return false;
  return true;
}

// Bir tekrar kuralı verilen günde ("YYYY-MM-DD") geçerli mi? null = her gün.
// Alışkanlığın o gün "vadeli/planlı" olup olmadığını belirler (streak + Bugün filtresi).
export function isScheduledOn(schedule: Recurrence | null, dateYmd: string): boolean {
  if (!schedule || schedule.freq === 'daily') return true;
  const d = new Date(`${dateYmd}T00:00:00`);
  if (schedule.freq === 'weekly') {
    return schedule.weekdays?.includes(d.getDay()) ?? false;
  }
  if (schedule.freq === 'monthly') {
    return d.getDate() === schedule.monthDay;
  }
  return true;
}

// Tekrarlayan bir görev tamamlanınca due_date'in ileri sarılacağı SONRAKİ tarih.
// currentDue "YYYY-MM-DD" ya da saatli "YYYY-MM-DDTHH:MM:SS" olabilir; saat
// bileşeni (varsa) korunur. today'den ve currentDue'nun gününden KESİN sonraki,
// kurala uyan ilk gün seçilir — gecikmiş bir görev geçmişe değil, ilk gelecek
// slota atlar (bugünden önceki günler asla üretilmez). Kurala uyan gün 366 gün
// içinde bulunamazsa (ör. haftalık kuralda hiç gün seçili değilse) null döner;
// çağıran bu durumda görevi ileri sarmak yerine normal tamamlamaya düşer.
export function nextTaskOccurrence(
  recurrence: Recurrence,
  currentDue: string,
  today: string
): string | null {
  const timePart = currentDue.length > 10 ? currentDue.slice(10) : '';
  const dueYmd = currentDue.slice(0, 10);
  // Gecikmiş görevde bugünden (dolayısıyla yarından) devam et; erken tamamlanan
  // (vadesi gelecekte) görevde kendi gününden sonrasına geç.
  const baseYmd = dueYmd > today ? dueYmd : today;
  const d = new Date(`${baseYmd}T00:00:00`);
  for (let i = 0; i < 366; i++) {
    d.setDate(d.getDate() + 1);
    const ymd = toYmd(d);
    if (isScheduledOn(recurrence, ymd)) return `${ymd}${timePart}`;
  }
  return null;
}

// Sıklık kuralının okunabilir kısa etiketi ("Her gün" / "Pzt·Çar·Cum").
// everyDayLabel ve dayLabels (JS getDay() sırasıyla, 0=Pazar...6=Cumartesi)
// çağırandan (t()) gelir — bu fonksiyon dile bağımlı metin barındırmaz.
export function scheduleLabel(
  schedule: Recurrence | null,
  everyDayLabel: string,
  dayLabels: string[]
): string {
  if (!schedule || schedule.freq === 'daily') return everyDayLabel;
  if (schedule.freq === 'weekly') {
    const wds = schedule.weekdays ?? [];
    if (wds.length === 0 || wds.length === 7) return everyDayLabel;
    return WEEKDAY_DISPLAY_ORDER.filter((w) => wds.includes(w))
      .map((w) => dayLabels[w])
      .join('·');
  }
  return everyDayLabel;
}
