// Push verisi güvenilmez girdidir: yalnız iyi biçimli ve bu telefonda oturum
// açmış hesaba yazılmış bir hatırlatma işlenir.

import { isNudgeData, nudgeOutcome, parseNudgeData } from '../nudgePayload';

const ME = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const ok = { type: 'nudge', kind: 'habit', itemId: ITEM, to: ME };

describe('parseNudgeData', () => {
  it('bu hesaba yazılmış iyi biçimli hatırlatmayı okur', () => {
    expect(parseNudgeData(ok, ME)).toEqual({ kind: 'habit', itemId: ITEM });
    expect(parseNudgeData({ ...ok, kind: 'goal' }, ME)).toEqual({ kind: 'goal', itemId: ITEM });
  });

  it('başka hesaba (telefonda önceki oturuma) yazılmışsa yok sayar', () => {
    expect(parseNudgeData({ ...ok, to: '33333333-3333-4333-8333-333333333333' }, ME)).toBeNull();
  });

  it('oturum yoksa hiçbir hatırlatma işlenmez', () => {
    expect(parseNudgeData(ok, null)).toBeNull();
  });

  it('bozuk veriyi reddeder', () => {
    expect(parseNudgeData(null, ME)).toBeNull();
    expect(parseNudgeData('nudge', ME)).toBeNull();
    expect(parseNudgeData({ ...ok, type: 'reminder' }, ME)).toBeNull();
    expect(parseNudgeData({ ...ok, kind: 'task' }, ME)).toBeNull();
    expect(parseNudgeData({ ...ok, itemId: '../../profile' }, ME)).toBeNull();
    expect(parseNudgeData({ ...ok, itemId: 42 }, ME)).toBeNull();
    expect(parseNudgeData({ ...ok, to: undefined }, ME)).toBeNull();
  });
});

describe('isNudgeData', () => {
  it('yalnız hatırlatma verisini tanır (yerel hatırlatıcılar etkilenmez)', () => {
    expect(isNudgeData(ok)).toBe(true);
    expect(isNudgeData({ habitId: ITEM })).toBe(false);
    expect(isNudgeData(undefined)).toBe(false);
  });
});

describe('nudgeOutcome', () => {
  it('sunucu cevabını düğme durumuna çevirir', () => {
    expect(nudgeOutcome('sent')).toBe('sent');
    expect(nudgeOutcome('rate_limited_item')).toBe('alreadyToday');
    expect(nudgeOutcome('rate_limited')).toBe('dailyLimit');
    expect(nudgeOutcome('no_device')).toBe('noDevice');
  });

  it('bilinmeyen/olumsuz her cevap başarısızdır (yedek: mesajla hatırlat)', () => {
    for (const s of ['forbidden', 'unauthorized', 'error', 'bad_request', undefined, null, 42]) {
      expect(nudgeOutcome(s)).toBe('failed');
    }
  });
});
