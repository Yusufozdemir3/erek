// Mola günü yalnız bugün ve alışkanlığa henüz başlanmamışken sunulur.

import { restDayOffered } from '../restDay';

const base = { viewingToday: true, completed: false, amount: 0, timerRunning: false };

describe('restDayOffered', () => {
  it('bugün, başlanmamış alışkanlıkta sunulur', () => {
    expect(restDayOffered(base)).toBe(true);
  });

  it('geçmiş ya da gelecek günde sunulmaz', () => {
    expect(restDayOffered({ ...base, viewingToday: false })).toBe(false);
  });

  it('tamamlanmış, sayılmaya başlanmış ya da zamanlayıcısı çalışan alışkanlıkta sunulmaz', () => {
    expect(restDayOffered({ ...base, completed: true })).toBe(false);
    expect(restDayOffered({ ...base, amount: 2 })).toBe(false);
    expect(restDayOffered({ ...base, timerRunning: true })).toBe(false);
  });
});
