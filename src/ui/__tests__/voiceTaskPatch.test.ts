// Ayrıştırılmış cümlenin forma uygulanması: yalnız söylenen alanlar değişir.

import type { ParsedTask } from '@/lib/quickAdd/parseTask';
import { MAX_REMINDERS_PER_ENTITY, TITLE_MAX_LEN } from '@/ui/formLimits';
import { DEFAULT_REMIND_TIME, fitTitle, voicePatch } from '../voiceTaskPatch';

const TODAY = '2026-10-07';
const parsed = (o: Partial<ParsedTask>): ParsedTask => ({
  title: '',
  date: null,
  time: null,
  priority: null,
  remind: false,
  ...o,
});
const current = { dueDate: TODAY, remindTimes: [] as string[] };

describe('voicePatch', () => {
  it('söylenmeyen alanlara dokunmaz', () => {
    expect(voicePatch(parsed({ title: 'Süt al' }), current, TODAY)).toEqual({ title: 'Süt al', titleTruncated: false });
  });

  it('başlıksız cümle (yalnız tarih/saat) başlığı değiştirmez', () => {
    const p = voicePatch(parsed({ date: '2026-10-08', time: '15:00' }), current, TODAY);
    expect(p).toEqual({ titleTruncated: false, dueDate: '2026-10-08', dueTime: '15:00' });
  });

  it('öncelik ve tarih/saat aktarılır', () => {
    const p = voicePatch(parsed({ title: 'Rapor', date: '2026-10-09', time: '10:00', priority: 'high' }), current, TODAY);
    expect(p).toMatchObject({ title: 'Rapor', dueDate: '2026-10-09', dueTime: '10:00', priority: 'high' });
  });

  it('"hatırlat" + saat: hatırlatma o saate eklenir', () => {
    const p = voicePatch(parsed({ title: 'İlaç', time: '20:00', date: TODAY, remind: true }), current, TODAY);
    expect(p.remindTimes).toEqual(['20:00']);
  });

  it('"hatırlat" + ileri tarih, saat yok: sabah varsayılanı', () => {
    const p = voicePatch(parsed({ title: 'Annemi ara', date: '2026-10-08', remind: true }), current, TODAY);
    expect(p.remindTimes).toEqual([DEFAULT_REMIND_TIME]);
  });

  it('"hatırlat" + bugün, saat yok: kullanıcıya bırakılır', () => {
    const p = voicePatch(parsed({ title: 'Annemi ara', remind: true }), current, TODAY);
    expect(p.remindTimes).toBeUndefined();
  });

  it('mevcut hatırlatmalar korunur, sıralı birleşir, tekrar eklenmez', () => {
    const cur = { dueDate: TODAY, remindTimes: ['21:00'] };
    expect(voicePatch(parsed({ time: '08:00', remind: true }), cur, TODAY).remindTimes).toEqual(['08:00', '21:00']);
    expect(voicePatch(parsed({ time: '21:00', remind: true }), cur, TODAY).remindTimes).toBeUndefined();
  });

  it('hatırlatma sınırı dolduysa yenisi eklenmez', () => {
    const full = Array.from({ length: MAX_REMINDERS_PER_ENTITY }, (_, i) => `0${i}:00`);
    const p = voicePatch(parsed({ time: '22:00', remind: true }), { dueDate: TODAY, remindTimes: full }, TODAY);
    expect(p.remindTimes).toBeUndefined();
  });

  it('"hatırlat" yoksa saat hatırlatma yaratmaz', () => {
    expect(voicePatch(parsed({ time: '15:00' }), current, TODAY).remindTimes).toBeUndefined();
  });
});

describe('fitTitle', () => {
  it('sınır içindeki başlığa dokunmaz', () => {
    expect(fitTitle('Annemi ara')).toEqual({ title: 'Annemi ara', truncated: false });
  });

  it('uzun başlığı kelime sınırında keser ve bildirir', () => {
    const long = 'Market alışverişi yap ve dönüşte eczaneye uğrayıp annemin ilaçlarını almayı unutma';
    const r = fitTitle(long);
    expect(r.truncated).toBe(true);
    expect(r.title.length).toBeLessThanOrEqual(TITLE_MAX_LEN);
    expect(long.startsWith(r.title)).toBe(true);
    expect(long[r.title.length]).toBe(' '); // kelimenin ortasından kesilmedi
  });

  it('boşluksuz uzun metni sınırdan keser', () => {
    const r = fitTitle('a'.repeat(100));
    expect(r).toEqual({ title: 'a'.repeat(TITLE_MAX_LEN), truncated: true });
  });
});
