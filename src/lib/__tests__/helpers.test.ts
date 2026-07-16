// helpers.ts testleri — isScheduledOn streak'in ve "Bugün" filtresinin temelidir.
// Sabit tarihler kullanılır: 2026-06-29 Pazartesi, 2026-07-01 Çarşamba.

import {
  diffDays,
  extractTime,
  hmToDate,
  isQuotaSchedule,
  isScheduledOn,
  isWithinHabitDates,
  lastDays,
  nextTaskOccurrence,
  parseJson,
  scheduleLabel,
  type ScheduleLabels,
  toHm,
  toJson,
  weekStartOf,
} from '../helpers';
import type { Recurrence } from '../../types/models';

describe('parseJson', () => {
  it('geçerli JSON parse edilir', () => {
    expect(parseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('null girişte null döner', () => {
    expect(parseJson(null)).toBeNull();
  });

  it('bozuk JSON hata fırlatmaz, null döner', () => {
    expect(parseJson('{bozuk')).toBeNull();
  });
});

describe('toJson', () => {
  it('null/undefined için null döner', () => {
    expect(toJson(null)).toBeNull();
    expect(toJson(undefined)).toBeNull();
  });

  it('nesneyi stringify eder', () => {
    expect(toJson({ freq: 'daily' })).toBe('{"freq":"daily"}');
  });
});

describe('isScheduledOn', () => {
  it('schedule null ise her gün planlıdır', () => {
    expect(isScheduledOn(null, '2026-07-01')).toBe(true);
    expect(isScheduledOn(null, '2026-07-05')).toBe(true);
  });

  it('daily her gün planlıdır', () => {
    const s: Recurrence = { freq: 'daily' };
    expect(isScheduledOn(s, '2026-07-01')).toBe(true);
  });

  it('weekly yalnızca seçili günlerde planlıdır', () => {
    const s: Recurrence = { freq: 'weekly', weekdays: [1, 3, 5] }; // Pzt, Çar, Cum
    expect(isScheduledOn(s, '2026-06-29')).toBe(true); // Pazartesi
    expect(isScheduledOn(s, '2026-07-01')).toBe(true); // Çarşamba
    expect(isScheduledOn(s, '2026-06-30')).toBe(false); // Salı
    expect(isScheduledOn(s, '2026-06-28')).toBe(false); // Pazar
  });

  it('weekly weekdays boş/eksikse hiçbir gün planlı değildir', () => {
    expect(isScheduledOn({ freq: 'weekly', weekdays: [] }, '2026-07-01')).toBe(false);
    expect(isScheduledOn({ freq: 'weekly' }, '2026-07-01')).toBe(false);
  });

  it('monthly yalnızca ayın seçili gününde planlıdır', () => {
    const s: Recurrence = { freq: 'monthly', monthDay: 15 };
    expect(isScheduledOn(s, '2026-07-15')).toBe(true);
    expect(isScheduledOn(s, '2026-07-14')).toBe(false);
  });

  it('interval çapadan itibaren her N günde bir planlıdır (çapadan öncesi değil)', () => {
    const s: Recurrence = { freq: 'interval', every: 3, anchor: '2026-07-01' };
    expect(isScheduledOn(s, '2026-07-01')).toBe(true); // çapa günü
    expect(isScheduledOn(s, '2026-07-04')).toBe(true);
    expect(isScheduledOn(s, '2026-07-07')).toBe(true);
    expect(isScheduledOn(s, '2026-07-02')).toBe(false);
    expect(isScheduledOn(s, '2026-07-03')).toBe(false);
    expect(isScheduledOn(s, '2026-06-28')).toBe(false); // çapadan önce
  });

  it('interval çapa/adım eksikse güvenli tarafa düşer: her gün', () => {
    expect(isScheduledOn({ freq: 'interval', every: 3 }, '2026-07-02')).toBe(true);
    expect(isScheduledOn({ freq: 'interval', anchor: '2026-07-01' }, '2026-07-02')).toBe(true);
  });

  it('weekly kota (timesPerWeek, gün seçilmemiş) her gün müsaittir', () => {
    const s: Recurrence = { freq: 'weekly', timesPerWeek: 3 };
    expect(isScheduledOn(s, '2026-07-01')).toBe(true);
    expect(isScheduledOn(s, '2026-07-05')).toBe(true);
  });

  it('yearly yalnızca seçili ay-gün tarihlerinde planlıdır', () => {
    const s: Recurrence = { freq: 'yearly', dates: ['07-15', '01-01'] };
    expect(isScheduledOn(s, '2026-07-15')).toBe(true);
    expect(isScheduledOn(s, '2027-01-01')).toBe(true);
    expect(isScheduledOn(s, '2026-07-14')).toBe(false);
  });
});

describe('isQuotaSchedule', () => {
  it('yalnızca weekdays boş + timesPerWeek>0 kota sayılır', () => {
    expect(isQuotaSchedule({ freq: 'weekly', timesPerWeek: 3 })).toBe(true);
    expect(isQuotaSchedule({ freq: 'weekly', weekdays: [1], timesPerWeek: 3 })).toBe(false);
    expect(isQuotaSchedule({ freq: 'weekly', weekdays: [1, 3] })).toBe(false);
    expect(isQuotaSchedule({ freq: 'daily' })).toBe(false);
    expect(isQuotaSchedule(null)).toBe(false);
  });
});

describe('diffDays / weekStartOf', () => {
  it('diffDays iki tarih arası gün farkını verir (b - a)', () => {
    expect(diffDays('2026-07-01', '2026-07-04')).toBe(3);
    expect(diffDays('2026-07-04', '2026-07-01')).toBe(-3);
    expect(diffDays('2026-07-01', '2026-07-01')).toBe(0);
  });

  it('weekStartOf günün pazartesisini verir (Pazar da aynı haftaya aittir)', () => {
    expect(weekStartOf('2026-07-15')).toBe('2026-07-13'); // Çarşamba → Pazartesi
    expect(weekStartOf('2026-07-13')).toBe('2026-07-13'); // Pazartesi → kendisi
    expect(weekStartOf('2026-07-19')).toBe('2026-07-13'); // Pazar → önceki Pazartesi
  });
});

describe('isWithinHabitDates', () => {
  it('ikisi de null ise her gün aralıktadır', () => {
    expect(isWithinHabitDates(null, null, '2026-07-01')).toBe(true);
  });

  it('başlangıçtan önceki gün aralık dışıdır, başlangıç günü dahildir', () => {
    expect(isWithinHabitDates('2026-07-01', null, '2026-06-30')).toBe(false);
    expect(isWithinHabitDates('2026-07-01', null, '2026-07-01')).toBe(true);
  });

  it('bitişten sonraki gün aralık dışıdır, bitiş günü dahildir', () => {
    expect(isWithinHabitDates(null, '2026-07-10', '2026-07-11')).toBe(false);
    expect(isWithinHabitDates(null, '2026-07-10', '2026-07-10')).toBe(true);
  });

  it('iki uç da veriliyse yalnızca aradaki günler geçerlidir', () => {
    expect(isWithinHabitDates('2026-07-01', '2026-07-10', '2026-07-05')).toBe(true);
    expect(isWithinHabitDates('2026-07-01', '2026-07-10', '2026-06-30')).toBe(false);
    expect(isWithinHabitDates('2026-07-01', '2026-07-10', '2026-07-11')).toBe(false);
  });
});

describe('nextTaskOccurrence', () => {
  // 2026-07-15 Çarşamba, 2026-07-16 Perşembe, 2026-07-17 Cuma (getDay: Çar=3).
  const daily: Recurrence = { freq: 'daily' };

  it('günlük: bugün vadeli görev bir sonraki güne (yarına) sarılır', () => {
    expect(nextTaskOccurrence(daily, '2026-07-15', '2026-07-15')).toBe('2026-07-16');
  });

  it('günlük: gecikmiş görev geçmişe değil, bugünden sonraki güne sarılır', () => {
    // Vade 3 gün önce ama bugün 15'i → sonraki = 16 (geçmiş üretilmez).
    expect(nextTaskOccurrence(daily, '2026-07-12', '2026-07-15')).toBe('2026-07-16');
  });

  it('saat bileşeni korunur', () => {
    expect(nextTaskOccurrence(daily, '2026-07-15T09:30:00', '2026-07-15')).toBe(
      '2026-07-16T09:30:00'
    );
  });

  it('haftalık: bir sonraki seçili güne atlar (Pzt·Cum kuralında Çarşamba→Cuma)', () => {
    const weekly: Recurrence = { freq: 'weekly', weekdays: [1, 5] }; // Pzt, Cum
    // Bugün Çarşamba (15) → sonraki seçili gün Cuma (17).
    expect(nextTaskOccurrence(weekly, '2026-07-15', '2026-07-15')).toBe('2026-07-17');
  });

  it('haftalık kuralda hiç gün yoksa null (çözülemez — çağıran normal tamamlar)', () => {
    expect(nextTaskOccurrence({ freq: 'weekly', weekdays: [] }, '2026-07-15', '2026-07-15')).toBeNull();
  });

  it('erken tamamlanan (vadesi gelecekte) görev kendi gününden sonrasına geçer', () => {
    // Vade 20'si, bugün 15'i → base 20, günlük sonraki = 21.
    expect(nextTaskOccurrence(daily, '2026-07-20', '2026-07-15')).toBe('2026-07-21');
  });

  it('interval: vadeden N gün sonrasına sarılır', () => {
    const rec: Recurrence = { freq: 'interval', every: 3, anchor: '2026-07-15' };
    expect(nextTaskOccurrence(rec, '2026-07-15', '2026-07-15')).toBe('2026-07-18');
  });

  it('monthly: bir sonraki ayın aynı gününe sarılır; 31 kısa ayı atlar', () => {
    expect(nextTaskOccurrence({ freq: 'monthly', monthDay: 15 }, '2026-07-15', '2026-07-15')).toBe(
      '2026-08-15'
    );
    // 31 çekmeyen aylar atlanır: 31 Tem → (Eylül 31 yok) → 31 Ağu zaten var; 31 Ağu'dan sonraki 31 Eki.
    expect(nextTaskOccurrence({ freq: 'monthly', monthDay: 31 }, '2026-08-31', '2026-08-31')).toBe(
      '2026-10-31'
    );
  });

  it('yearly: bir sonraki yılın seçili tarihine sarılır (birden çok tarihte en yakını)', () => {
    const rec: Recurrence = { freq: 'yearly', dates: ['07-15', '12-01'] };
    expect(nextTaskOccurrence(rec, '2026-07-15', '2026-07-15')).toBe('2026-12-01');
    expect(nextTaskOccurrence(rec, '2026-12-01', '2026-12-01')).toBe('2027-07-15');
  });
});

describe('scheduleLabel', () => {
  // Fonksiyon dile bağımlı metin barındırmıyor; etiket seti çağırandan gelir
  // (bkz. buildScheduleLabels — burada sade bir sahte set kullanılır).
  const LABELS: ScheduleLabels = {
    everyDay: 'Her gün',
    dayNames: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'], // 0=Pazar...6=Cumartesi
    everyNDays: (n) => `${n} günde bir`,
    timesPerWeek: (n) => `Haftada ${n} kez`,
    monthDay: (d) => `Her ayın ${d}. günü`,
    yearly: (dates) => `Her yıl: ${dates}`,
    formatMonthDay: (md) => md.split('-').reverse().join('.'),
  };

  it('null ve daily için "Her gün"', () => {
    expect(scheduleLabel(null, LABELS)).toBe('Her gün');
    expect(scheduleLabel({ freq: 'daily' }, LABELS)).toBe('Her gün');
  });

  it('weekly seçili günleri Pazartesi başlangıçlı sırayla listeler', () => {
    expect(scheduleLabel({ freq: 'weekly', weekdays: [1, 3, 5] }, LABELS)).toBe('Pzt·Çar·Cum');
    // Görüntü sırası Pzt..Paz olduğundan Pazar (0) en sona düşer.
    expect(scheduleLabel({ freq: 'weekly', weekdays: [0, 1] }, LABELS)).toBe('Pzt·Paz');
  });

  it('weekly boş ya da 7 gün seçiliyse "Her gün"', () => {
    expect(scheduleLabel({ freq: 'weekly', weekdays: [] }, LABELS)).toBe('Her gün');
    expect(scheduleLabel({ freq: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6] }, LABELS)).toBe('Her gün');
  });

  it('kota, aralık, aylık ve yıllık kurallar kendi etiketlerini üretir', () => {
    expect(scheduleLabel({ freq: 'weekly', timesPerWeek: 3 }, LABELS)).toBe('Haftada 3 kez');
    expect(scheduleLabel({ freq: 'interval', every: 3, anchor: '2026-07-01' }, LABELS)).toBe('3 günde bir');
    expect(scheduleLabel({ freq: 'monthly', monthDay: 15 }, LABELS)).toBe('Her ayın 15. günü');
    // Tarihler sıralanır: 01-01, 07-15 → "01.01, 15.07".
    expect(scheduleLabel({ freq: 'yearly', dates: ['07-15', '01-01'] }, LABELS)).toBe('Her yıl: 01.01, 15.07');
  });
});

describe('lastDays', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-07-01T12:00:00') });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('bugün dahil son N günü en eskiden bugüne sırayla döner', () => {
    expect(lastDays(3)).toEqual(['2026-06-29', '2026-06-30', '2026-07-01']);
  });

  it('1 istenirse yalnızca bugünü döner', () => {
    expect(lastDays(1)).toEqual(['2026-07-01']);
  });
});

describe('toHm / hmToDate', () => {
  it('toHm saat:dakika döner (iki haneli)', () => {
    const d = new Date();
    d.setHours(8, 5, 0, 0);
    expect(toHm(d)).toBe('08:05');
  });

  it('hmToDate verilen saati bugüne uygular', () => {
    const d = hmToDate('14:30');
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });

  it('hmToDate null verilirse şimdiki saati döner (hata vermez)', () => {
    expect(() => hmToDate(null)).not.toThrow();
  });
});

describe('extractTime', () => {
  it('yalnızca tarih varsa null döner', () => {
    expect(extractTime('2026-07-05')).toBeNull();
    expect(extractTime(null)).toBeNull();
  });

  it('tarih+saat varsa "HH:MM" döner', () => {
    expect(extractTime('2026-07-05T14:30:00')).toBe('14:30');
  });
});
