// helpers.ts testleri — isScheduledOn streak'in ve "Bugün" filtresinin temelidir.
// Sabit tarihler kullanılır: 2026-06-29 Pazartesi, 2026-07-01 Çarşamba.

import {
  extractTime,
  hmToDate,
  isScheduledOn,
  isWithinHabitDates,
  lastDays,
  nextTaskOccurrence,
  parseJson,
  scheduleLabel,
  toHm,
  toJson,
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
});

describe('scheduleLabel', () => {
  // Fonksiyon artık dile bağımlı metin barındırmıyor; çağıran (t()) verir.
  const EVERY_DAY = 'Her gün';
  const DAY_LABELS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']; // 0=Pazar...6=Cumartesi

  it('null ve daily için "Her gün"', () => {
    expect(scheduleLabel(null, EVERY_DAY, DAY_LABELS)).toBe('Her gün');
    expect(scheduleLabel({ freq: 'daily' }, EVERY_DAY, DAY_LABELS)).toBe('Her gün');
  });

  it('weekly seçili günleri Pazartesi başlangıçlı sırayla listeler', () => {
    expect(scheduleLabel({ freq: 'weekly', weekdays: [1, 3, 5] }, EVERY_DAY, DAY_LABELS)).toBe('Pzt·Çar·Cum');
    // Görüntü sırası Pzt..Paz olduğundan Pazar (0) en sona düşer.
    expect(scheduleLabel({ freq: 'weekly', weekdays: [0, 1] }, EVERY_DAY, DAY_LABELS)).toBe('Pzt·Paz');
  });

  it('weekly boş ya da 7 gün seçiliyse "Her gün"', () => {
    expect(scheduleLabel({ freq: 'weekly', weekdays: [] }, EVERY_DAY, DAY_LABELS)).toBe('Her gün');
    expect(scheduleLabel({ freq: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6] }, EVERY_DAY, DAY_LABELS)).toBe('Her gün');
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
