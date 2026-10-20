// planGeneralSlots: which general-reminder notifications get scheduled.

import { GENERAL_HORIZON_DAYS, planGeneralSlots } from '../generalRemindersLogic';
import { checkUsername } from '../username';

const today = '2026-10-18';
const at = (hm: string) => new Date(`${today}T${hm}:00`);

describe('planGeneralSlots', () => {
  it('bugün işaretlenmemiş bir şey varsa bugünün kalan saatlerini ve sonraki günleri kurar', () => {
    const slots = planGeneralSlots(['09:00', '20:00'], today, at('12:00'), 3);
    // 09:00 today has passed; 20:00 today + both times for the next 6 days.
    expect(slots).toHaveLength(1 + 2 * (GENERAL_HORIZON_DAYS - 1));
    expect(slots[0]).toMatchObject({ id: 'general:2026-10-18:20:00', pending: 3 });
    expect(slots[1]).toMatchObject({ id: 'general:2026-10-19:09:00', pending: null });
  });

  it('bugün her şey bittiyse bugünün saatleri kurulmaz, sonraki günler kurulur', () => {
    const slots = planGeneralSlots(['20:00'], today, at('12:00'), 0);
    expect(slots.map((s) => s.id)).not.toContain('general:2026-10-18:20:00');
    expect(slots).toHaveLength(GENERAL_HORIZON_DAYS - 1);
  });

  it('geçmiş saatler elenir; saat yoksa hiçbir şey kurulmaz', () => {
    expect(planGeneralSlots(['08:00'], today, at('12:00'), 2).map((s) => s.id)).not.toContain(
      'general:2026-10-18:08:00'
    );
    expect(planGeneralSlots([], today, at('12:00'), 2)).toEqual([]);
  });

  it('aynı yuva aynı kimliği alır (yeniden kurmak eskisinin yerine geçer)', () => {
    const a = planGeneralSlots(['20:00'], today, at('12:00'), 2);
    const b = planGeneralSlots(['20:00'], today, at('13:00'), 1);
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
  });
});

describe('checkUsername', () => {
  it('geçerli adları kabul eder (Türkçe harf, boşluk, rakam)', () => {
    expect(checkUsername('Yusuf')).toBe('ok');
    expect(checkUsername('  Şükrü Öz  ')).toBe('ok');
    expect(checkUsername('ab')).toBe('ok');
  });

  it('kısa, uzun ve yasak karakterli adları reddeder', () => {
    expect(checkUsername(' a ')).toBe('tooShort');
    expect(checkUsername('x'.repeat(21))).toBe('tooLong');
    expect(checkUsername('ali@gmail.com')).toBe('badChars');
    expect(checkUsername('ali#1234')).toBe('badChars');
  });
});
