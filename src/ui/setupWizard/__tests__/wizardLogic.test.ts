// Sihirbazın saf mantığı: adım sırası, atlanabilirlik, öneriler, tarih hesapları.

import {
  buildSteps,
  dueDateOf,
  deadlineIn,
  DEADLINE_PRESET_DAYS,
  GOAL_SUGGESTIONS,
  HABIT_SUGGESTIONS,
  parseTarget,
  progress,
  scheduleFor,
  SKIPPABLE,
  summaryLines,
} from '../wizardLogic';
import { translations } from '@/i18n/translations';

describe('buildSteps', () => {
  it('her şey varsa tam sıra: karşılama … bitiş', () => {
    expect(buildSteps({ accounts: true, widget: true })).toEqual([
      'welcome', 'look', 'habit', 'task', 'goal', 'notifications', 'widget', 'account', 'done',
    ]);
  });

  it('çalışamayacak adım hiç eklenmez', () => {
    const noAccount = buildSteps({ accounts: false, widget: true });
    expect(noAccount).not.toContain('account');
    const noWidget = buildSteps({ accounts: true, widget: false });
    expect(noWidget).not.toContain('widget');
    expect(buildSteps({ accounts: false, widget: false })).toEqual([
      'welcome', 'look', 'habit', 'task', 'goal', 'notifications', 'done',
    ]);
  });

  it('karşılama hep ilk, bitiş hep son', () => {
    for (const accounts of [true, false]) {
      for (const widget of [true, false]) {
        const s = buildSteps({ accounts, widget });
        expect(s[0]).toBe('welcome');
        expect(s[s.length - 1]).toBe('done');
      }
    }
  });
});

describe('SKIPPABLE', () => {
  it('çerçeve sayfaları atlanamaz, gerçek adımların hepsi atlanabilir', () => {
    expect(SKIPPABLE.has('welcome')).toBe(false);
    expect(SKIPPABLE.has('done')).toBe(false);
    for (const s of buildSteps({ accounts: true, widget: true })) {
      if (s !== 'welcome' && s !== 'done') expect(SKIPPABLE.has(s)).toBe(true);
    }
  });
});

describe('progress', () => {
  const steps = buildSteps({ accounts: true, widget: true });

  it('yalnız gerçek adımları sayar', () => {
    expect(progress(steps, 0)).toBeNull(); // karşılama
    expect(progress(steps, 1)).toEqual({ current: 1, total: 7 });
    expect(progress(steps, 7)).toEqual({ current: 7, total: 7 });
    expect(progress(steps, 8)).toBeNull(); // bitiş
  });

  it('adım çıkınca toplam kendiliğinden küçülür', () => {
    expect(progress(buildSteps({ accounts: false, widget: false }), 1)).toEqual({ current: 1, total: 5 });
  });
});

describe('öneri listeleri', () => {
  // (Simgelerin gerçekten var olduğu SetupWizard.ui.test'te denetlenir: habitIcons.tsx
  // bir ekran bileşeni, bu hızlı Node ortamında derlenmez.)
  it('her öneri üç dilde karşılanıyor', () => {
    for (const s of HABIT_SUGGESTIONS) {
      for (const lang of ['tr', 'en', 'de'] as const) expect(translations[lang][s.labelKey]).toBeTruthy();
    }
    for (const g of GOAL_SUGGESTIONS) {
      for (const lang of ['tr', 'en', 'de'] as const) {
        expect(translations[lang][g.labelKey]).toBeTruthy();
        expect(translations[lang][g.unitKey]).toBeTruthy();
      }
      expect(g.target).toBeGreaterThan(0);
    }
  });

  it('öneri kimlikleri benzersiz', () => {
    expect(new Set(HABIT_SUGGESTIONS.map((s) => s.id)).size).toBe(HABIT_SUGGESTIONS.length);
    expect(new Set(GOAL_SUGGESTIONS.map((s) => s.id)).size).toBe(GOAL_SUGGESTIONS.length);
  });
});

describe('scheduleFor', () => {
  it('her gün = null; hafta içi = Pzt-Cum; haftada 3 = kota', () => {
    expect(scheduleFor('daily')).toBeNull();
    expect(scheduleFor('weekdays')).toEqual({ freq: 'weekly', weekdays: [1, 2, 3, 4, 5] });
    expect(scheduleFor('threePerWeek')).toEqual({ freq: 'weekly', weekdays: [], timesPerWeek: 3 });
  });
});

describe('deadlineIn', () => {
  it('ay ve yıl sınırını doğru aşar', () => {
    expect(deadlineIn(30, new Date(2026, 9, 3))).toBe('2026-11-02');
    expect(deadlineIn(90, new Date(2026, 11, 20))).toBe('2027-03-20');
    expect(deadlineIn(365, new Date(2027, 0, 1))).toBe('2028-01-01');
  });

  it('yaz saati geçişinde gün kaymaz', () => {
    expect(deadlineIn(1, new Date(2026, 2, 28))).toBe('2026-03-29');
    expect(deadlineIn(2, new Date(2026, 2, 28))).toBe('2026-03-30');
  });

  it('hazır seçenekler artan ve makul', () => {
    expect([...DEADLINE_PRESET_DAYS]).toEqual([...DEADLINE_PRESET_DAYS].sort((a, b) => a - b));
    expect(DEADLINE_PRESET_DAYS[0]).toBeGreaterThanOrEqual(7);
  });
});

describe('parseTarget', () => {
  it('geçerli sayıyı alır, virgülü noktaya çevirir', () => {
    expect(parseTarget('100')).toBe(100);
    expect(parseTarget(' 2,5 ')).toBe(2.5);
  });

  it('boş, sıfır, negatif, harf ve aşırı büyüğü reddeder', () => {
    for (const bad of ['', '0', '-3', 'abc', '1e12', 'NaN', 'Infinity']) expect(parseTarget(bad)).toBeNull();
  });
});

describe('dueDateOf', () => {
  it('saat yoksa yalnız gün; varsa gömülü', () => {
    expect(dueDateOf('2026-10-08', null, '2026-10-03')).toBe('2026-10-08');
    expect(dueDateOf('2026-10-08', '19:00', '2026-10-03')).toBe('2026-10-08T19:00:00');
  });

  it('tarih söylenmediyse bugüne düşer', () => {
    expect(dueDateOf(null, null, '2026-10-03')).toBe('2026-10-03');
    expect(dueDateOf(null, '09:30', '2026-10-03')).toBe('2026-10-03T09:30:00');
  });
});

describe('summaryLines', () => {
  it('yalnız gerçekten yapılanları listeler', () => {
    expect(summaryLines({}, {}, false, false)).toEqual([]);
    expect(
      summaryLines({ habit: 'Su iç', goal: '12 kitap' }, { notifications: 'done', account: 'skipped' }, true, false)
    ).toEqual([{ key: 'habit', text: 'Su iç' }, { key: 'goal', text: '12 kitap' }, { key: 'notifications' }]);
  });

  it('bildirim atlandıysa ya da izin yoksa bildirim satırı çıkmaz', () => {
    expect(summaryLines({}, { notifications: 'skipped' }, true, false)).toEqual([]);
    expect(summaryLines({}, { notifications: 'done' }, false, false)).toEqual([]);
  });

  it('hesap satırı yalnız bağlanıldıysa çıkar', () => {
    expect(summaryLines({}, { account: 'done' }, false, true)).toEqual([{ key: 'account' }]);
    expect(summaryLines({}, { account: 'done' }, false, false)).toEqual([]);
  });
});
