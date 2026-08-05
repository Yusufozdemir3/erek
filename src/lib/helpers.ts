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

// Süre-ölçümlü sayısal hedef işareti — Goal.unit alanına yazılır (gerçek bir
// birim metni değil, "bu hedefin target/current_value'su SANİYE cinsinden"
// demek — habit.kind='timer'in dakika→saniye deseninin hedeflere taşınmış
// hali). Migration/yeni kolon GEREKMEDİ: unit zaten serbest metin TEXT.
export const TIME_UNIT = '__time__';
export function isTimeUnit(unit: string | null | undefined): boolean {
  return unit === TIME_UNIT;
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

// SQLite bir sorguda sınırlı sayıda bağlı değişken kabul eder (modern sürümlerde
// 32766, eskilerde 999). `IN (?, ?, …)` üreten TOPLU sorgular bu sayıyı doğrudan
// liste uzunluğundan aldığı için, yeterince uzun bir listede sorgu anlaşılmaz bir
// hatayla patlar — ve bu tam da "uygulamayı en çok kullanan" kişide olur. Parçalara
// bölüp sonuçları birleştirmek sınırı tümüyle konu dışı bırakır.
export const SQL_PARAM_CHUNK = 400;

export function chunk<T>(items: T[], size: number = SQL_PARAM_CHUNK): T[][] {
  if (items.length <= size) return items.length > 0 ? [items] : [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
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

// İki "YYYY-MM-DD" arasındaki tam gün farkı (b - a; b ileriyse pozitif).
export function diffDays(aYmd: string, bYmd: string): number {
  const a = new Date(`${aYmd}T00:00:00`);
  const b = new Date(`${bYmd}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// Verilen günün içinde bulunduğu haftanın pazartesisi ("YYYY-MM-DD").
// Kota ("haftada X kez") hesapları haftayı hep Pazartesi başlangıçlı sayar.
export function weekStartOf(dateYmd: string): string {
  const d = new Date(`${dateYmd}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toYmd(d);
}

// Haftalık ESNEK KOTA kuralı mı ("haftada X kez", gün seçilmeden)?
// Kota kuralında hiçbir gün tek başına "vadeli" değildir: alışkanlık her gün
// yapılabilir, başarı ölçüsü haftalık toplamdır (seri de hafta bazında sayılır).
export function isQuotaSchedule(schedule: Recurrence | null): boolean {
  return (
    !!schedule &&
    schedule.freq === 'weekly' &&
    (schedule.weekdays?.length ?? 0) === 0 &&
    (schedule.timesPerWeek ?? 0) > 0
  );
}

// Bir tekrar kuralı verilen günde ("YYYY-MM-DD") geçerli mi? null = her gün.
// Alışkanlığın o gün "vadeli/planlı" olup olmadığını belirler (streak + Bugün filtresi).
// Kota kuralı (haftada X kez) her gün "müsait" sayılır — değerlendirme haftalıktır.
export function isScheduledOn(schedule: Recurrence | null, dateYmd: string): boolean {
  if (!schedule || schedule.freq === 'daily') return true;
  if (schedule.freq === 'weekly') {
    if (isQuotaSchedule(schedule)) return true;
    const d = new Date(`${dateYmd}T00:00:00`);
    return schedule.weekdays?.includes(d.getDay()) ?? false;
  }
  if (schedule.freq === 'monthly') {
    if (!schedule.monthDay) return false;
    const d = new Date(`${dateYmd}T00:00:00`);
    // AYIN SONUNA KIRPMA: "ayın 31'i" seçen kullanıcı 30 günlük aylarda ve
    // Şubat'ta hiç planlı gün almıyordu — alışkanlık yılda 5 ay görünmüyor,
    // "her ay sonu" niyeti sessizce kayboluyordu. Ayın son gününü aşan seçim,
    // o ayın son gününe düşer (takvim uygulamalarının standart davranışı).
    // BEDELİ (bilinçli): 29/30/31 seçmiş mevcut alışkanlıklarda artık daha çok
    // planlı gün var, yani o günler işaretlenmezse seri bozulur. Alternatifi —
    // ayı tamamen atlamak — zaten yanlış olan davranışı sürdürmekti.
    const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(schedule.monthDay, lastDayOfMonth);
  }
  if (schedule.freq === 'interval') {
    const every = schedule.every ?? 0;
    if (every < 1 || !schedule.anchor) return true; // bozuk kural — güvenli taraf: her gün
    const diff = diffDays(schedule.anchor, dateYmd);
    return diff >= 0 && diff % every === 0;
  }
  if (schedule.freq === 'yearly') {
    return schedule.dates?.includes(dateYmd.slice(5)) ?? false;
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
  // 4+ yıl tarama: yıllık kuralda 29 Şubat gibi en seyrek gün bile bulunur.
  for (let i = 0; i < 1462; i++) {
    d.setDate(d.getDate() + 1);
    const ymd = toYmd(d);
    if (isScheduledOn(recurrence, ymd)) return `${ymd}${timePart}`;
  }
  return null;
}

// scheduleLabel'ın dil bağımlı parçaları — çağıran t() üzerinden üretir
// (bkz. buildScheduleLabels). Bu modül çevrilmiş metin barındırmaz.
export interface ScheduleLabels {
  everyDay: string;
  dayNames: string[]; // JS getDay() sırası (0=Pazar ... 6=Cumartesi)
  everyNDays: (n: number) => string;   // "3 günde bir"
  timesPerWeek: (n: number) => string; // "Haftada 3 kez"
  monthDay: (d: number) => string;     // "Her ayın 15'i"
  yearly: (dates: string) => string;   // "Her yıl: 12 Şub, 1 Oca"
  formatMonthDay: (md: string) => string; // "MM-DD" -> "12 Şub" (yerelli) ya da "12.02"
}

// Ortak etiket fabrikası: hem React tarafı (useI18n().t) hem React-dışı taraf
// (translate(lang, ...)) aynı imzada bir çevirici verebilir. formatMonthDay
// verilmezse yerelsiz "GG.AA" biçimi kullanılır.
export function buildScheduleLabels(
  tr: (key: string, params?: Record<string, string | number>) => string,
  formatMonthDay?: (md: string) => string
): ScheduleLabels {
  const DAY_KEYS = [
    'weekday.sun', 'weekday.mon', 'weekday.tue', 'weekday.wed',
    'weekday.thu', 'weekday.fri', 'weekday.sat',
  ];
  return {
    everyDay: tr('habit.everyDay'),
    dayNames: DAY_KEYS.map((k) => tr(k)),
    everyNDays: (n) => tr('schedule.everyNDays', { n }),
    timesPerWeek: (n) => tr('schedule.timesPerWeek', { n }),
    monthDay: (d) => tr('schedule.monthDay', { d }),
    yearly: (dates) => tr('schedule.yearly', { dates }),
    formatMonthDay: formatMonthDay ?? ((md) => md.split('-').reverse().join('.')),
  };
}

// Sıklık kuralının okunabilir kısa etiketi ("Her gün" / "Pzt·Çar·Cum" /
// "3 günde bir" / "Haftada 3 kez" / "Her ayın 15'i" / "Her yıl: ...").
export function scheduleLabel(schedule: Recurrence | null, labels: ScheduleLabels): string {
  if (!schedule || schedule.freq === 'daily') return labels.everyDay;
  if (schedule.freq === 'weekly') {
    if (isQuotaSchedule(schedule)) return labels.timesPerWeek(schedule.timesPerWeek ?? 1);
    const wds = schedule.weekdays ?? [];
    if (wds.length === 0 || wds.length === 7) return labels.everyDay;
    return WEEKDAY_DISPLAY_ORDER.filter((w) => wds.includes(w))
      .map((w) => labels.dayNames[w])
      .join('·');
  }
  if (schedule.freq === 'monthly') return labels.monthDay(schedule.monthDay ?? 1);
  if (schedule.freq === 'interval') return labels.everyNDays(schedule.every ?? 1);
  if (schedule.freq === 'yearly') {
    const ds = [...(schedule.dates ?? [])].sort();
    if (ds.length === 0) return labels.everyDay;
    return labels.yearly(ds.map(labels.formatMonthDay).join(', '));
  }
  return labels.everyDay;
}
