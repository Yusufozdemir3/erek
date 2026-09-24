// habitFormLogic tests — these transforms had NEVER been tested while
// embedded inside HabitForm's submit (audit H1+F1). Locked-in contract:
// invalid input is not an error, it's a safe default.

import {
  buildSchedule,
  buildTarget,
  clampEndDate,
  ratioToGoalFactor,
  type ScheduleInput,
} from '../habitFormLogic';
import { todayDate } from '@/lib/helpers';

const base: ScheduleInput = {
  freqMode: 'daily',
  weekdays: [],
  everyNText: '2',
  quotaText: '3',
  startDate: null,
  previousSchedule: null,
};

describe('buildSchedule — her gün', () => {
  it('daily kipi null döner (Recurrence yok = her gün)', () => {
    expect(buildSchedule(base)).toBeNull();
  });
});

describe('buildSchedule — belirli günler', () => {
  it('seçili günleri SIRALI verir', () => {
    const s = buildSchedule({ ...base, freqMode: 'days', weekdays: [5, 1, 3] });
    expect(s).toEqual({ freq: 'weekly', weekdays: [1, 3, 5] });
  });

  it('hiç gün seçilmemişse her güne düşer', () => {
    expect(buildSchedule({ ...base, freqMode: 'days', weekdays: [] })).toBeNull();
  });

  it('girdi dizisini MUTASYONA UĞRATMAZ', () => {
    const weekdays = [5, 1, 3];
    buildSchedule({ ...base, freqMode: 'days', weekdays });
    expect(weekdays).toEqual([5, 1, 3]);
  });
});

describe('buildSchedule — aralık (her X günde bir)', () => {
  it('geçerli sayıda çapa başlangıç tarihidir', () => {
    const s = buildSchedule({
      ...base,
      freqMode: 'interval',
      everyNText: '3',
      startDate: '2026-07-01',
    });
    expect(s).toEqual({ freq: 'interval', every: 3, anchor: '2026-07-01' });
  });

  it('başlangıç yoksa çapa bugündür', () => {
    const s = buildSchedule({ ...base, freqMode: 'interval', everyNText: '4' });
    expect(s).toEqual({ freq: 'interval', every: 4, anchor: todayDate() });
  });

  it('DÜZENLEMEDE mevcut çapa korunur (planlı günler kaymasın)', () => {
    const s = buildSchedule({
      ...base,
      freqMode: 'interval',
      everyNText: '3',
      startDate: '2026-07-20',
      previousSchedule: { freq: 'interval', every: 3, anchor: '2026-01-05' },
    });
    expect(s).toEqual({ freq: 'interval', every: 3, anchor: '2026-01-05' });
  });

  it('2\'den küçük ya da geçersiz sayı her güne düşer', () => {
    for (const txt of ['1', '0', '-3', '', 'abc']) {
      expect(buildSchedule({ ...base, freqMode: 'interval', everyNText: txt })).toBeNull();
    }
  });
});

describe('buildSchedule — kota (haftada X kez)', () => {
  it('1-7 arası sayıyı kabul eder', () => {
    expect(buildSchedule({ ...base, freqMode: 'quota', quotaText: '3' })).toEqual({
      freq: 'weekly',
      timesPerWeek: 3,
    });
  });

  it('aralık dışı ya da geçersiz sayı her güne düşer', () => {
    for (const txt of ['0', '8', '', 'x']) {
      expect(buildSchedule({ ...base, freqMode: 'quota', quotaText: txt })).toBeNull();
    }
  });
});

describe('buildTarget', () => {
  it('ikili alışkanlıkta hedef de birim de null', () => {
    expect(buildTarget('binary', '8', 'bardak')).toEqual({ target_amount: null, unit: null });
  });

  it('nicelde miktar + birim', () => {
    expect(buildTarget('numeric', '8', 'bardak')).toEqual({ target_amount: 8, unit: 'bardak' });
  });

  it('nicelde virgüllü ondalık kabul edilir', () => {
    expect(buildTarget('numeric', '2,5', 'km').target_amount).toBe(2.5);
  });

  it('nicelde miktar yoksa birim de yazılmaz', () => {
    expect(buildTarget('numeric', '', 'bardak')).toEqual({ target_amount: null, unit: null });
  });

  it('nicelde boş/boşluk birim null olur', () => {
    expect(buildTarget('numeric', '8', '   ').unit).toBeNull();
  });

  it('zamanlayıcıda DAKİKA girilir, SANİYE saklanır', () => {
    expect(buildTarget('timer', '30', '')).toEqual({ target_amount: 1800, unit: null });
  });

  it('zamanlayıcıda ondalık dakika en yakın saniyeye yuvarlanır', () => {
    expect(buildTarget('timer', '1,5', '').target_amount).toBe(90);
  });

  it('sıfır ve negatif hedef null sayılır', () => {
    expect(buildTarget('numeric', '0', 'x').target_amount).toBeNull();
    expect(buildTarget('timer', '-5', '').target_amount).toBeNull();
  });
});

describe('ratioToGoalFactor', () => {
  it('oranın TERSİNİ verir (4 sayfa = 1 bölüm -> 0.25)', () => {
    expect(ratioToGoalFactor('4')).toBeCloseTo(0.25);
  });

  it('virgüllü ondalık kabul eder', () => {
    expect(ratioToGoalFactor('2,5')).toBeCloseTo(0.4);
  });

  it('geçersiz/sıfır/negatif girdi 1\'e (birebir katkı) düşer', () => {
    for (const txt of ['', 'abc', '0', '-2']) expect(ratioToGoalFactor(txt)).toBe(1);
  });
});

describe('clampEndDate', () => {
  it('bitiş başlangıçtan önceyse başlangıca çekilir', () => {
    expect(clampEndDate('2026-07-10', '2026-07-01')).toBe('2026-07-10');
  });

  it('normal aralık aynen kalır', () => {
    expect(clampEndDate('2026-07-01', '2026-07-10')).toBe('2026-07-10');
  });

  it('biri yoksa dokunulmaz', () => {
    expect(clampEndDate(null, '2026-07-01')).toBe('2026-07-01');
    expect(clampEndDate('2026-07-01', null)).toBeNull();
  });
});
