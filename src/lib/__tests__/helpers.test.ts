// helpers.ts testleri — isScheduledOn streak'in ve "Bugün" filtresinin temelidir.
// Sabit tarihler kullanılır: 2026-06-29 Pazartesi, 2026-07-01 Çarşamba.

import { isScheduledOn, lastDays, parseJson, scheduleLabel, toJson } from '../helpers';
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

describe('scheduleLabel', () => {
  it('null ve daily için "Her gün"', () => {
    expect(scheduleLabel(null)).toBe('Her gün');
    expect(scheduleLabel({ freq: 'daily' })).toBe('Her gün');
  });

  it('weekly seçili günleri Pazartesi başlangıçlı sırayla listeler', () => {
    expect(scheduleLabel({ freq: 'weekly', weekdays: [1, 3, 5] })).toBe('Pzt·Çar·Cum');
    // Görüntü sırası Pzt..Paz olduğundan Pazar (0) en sona düşer.
    expect(scheduleLabel({ freq: 'weekly', weekdays: [0, 1] })).toBe('Pzt·Paz');
  });

  it('weekly boş ya da 7 gün seçiliyse "Her gün"', () => {
    expect(scheduleLabel({ freq: 'weekly', weekdays: [] })).toBe('Her gün');
    expect(scheduleLabel({ freq: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6] })).toBe('Her gün');
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
