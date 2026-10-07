import {
  adsRemoved,
  annualSavingsPercent,
  cacheFromCustomerInfo,
  canAddFriend,
  effectiveAccent,
  effectiveFont,
  featuresUnlocked,
  grantActive,
  INITIAL_STATE,
  INTRO_MS,
  isChartPeriodFree,
  isWidgetFree,
  OFFLINE_GRACE_MS,
  parseCache,
  planKind,
  reminderLimit,
  serializeCache,
  trialDays,
  type PlusState,
} from '../plusLogic';

const base: PlusState = { billing: true, plus: false, adsFree: false, introEndsAt: null };

describe('featuresUnlocked', () => {
  it('is open when there is nothing to buy', () => {
    expect(featuresUnlocked(INITIAL_STATE)).toBe(true);
  });
  it('is locked after the intro period without Plus', () => {
    expect(featuresUnlocked({ ...base, introEndsAt: 1000 }, 2000)).toBe(false);
  });
  it('is open during the intro period', () => {
    expect(featuresUnlocked({ ...base, introEndsAt: 1000 + INTRO_MS }, 2000)).toBe(true);
  });
  it('is open with Plus', () => {
    expect(featuresUnlocked({ ...base, plus: true, introEndsAt: 0 }, 2000)).toBe(true);
  });
  it('the ads-free purchase alone does not unlock features', () => {
    expect(featuresUnlocked({ ...base, adsFree: true, introEndsAt: 0 }, 2000)).toBe(false);
  });
});

describe('adsRemoved', () => {
  it('is not removed by missing billing', () => {
    expect(adsRemoved(INITIAL_STATE)).toBe(false);
  });
  it('is removed by Plus or ads-free', () => {
    expect(adsRemoved({ ...base, plus: true })).toBe(true);
    expect(adsRemoved({ ...base, adsFree: true })).toBe(true);
  });
});

describe('limits', () => {
  it('reminders: one when locked, the full cap when open', () => {
    expect(reminderLimit(false)).toBe(1);
    expect(reminderLimit(true)).toBeGreaterThan(1);
  });
  it('friends: the first is free', () => {
    expect(canAddFriend(false, 0)).toBe(true);
    expect(canAddFriend(false, 1)).toBe(false);
    expect(canAddFriend(true, 5)).toBe(true);
  });
  it('only the Day chart and the Today/QuickAdd widgets are free', () => {
    expect(isChartPeriodFree('day')).toBe(true);
    expect(isChartPeriodFree('week')).toBe(false);
    expect(isChartPeriodFree('month')).toBe(false);
    expect(isWidgetFree('ErekToday')).toBe(true);
    expect(isWidgetFree('ErekQuickAdd')).toBe(true);
    expect(isWidgetFree('ErekGoals')).toBe(false);
  });
  it('locked accents and fonts fall back; open ones are kept', () => {
    expect(effectiveAccent('pine', false)).toBe('pine');
    expect(effectiveAccent('ink', false)).toBe('ink');
    expect(effectiveAccent('violet' as never, false)).toBe('pine');
    expect(effectiveAccent('violet' as never, true)).toBe('violet');
    expect(effectiveFont('system', false)).toBe('system');
    expect(effectiveFont('serif' as never, false)).toBe('system');
    expect(effectiveFont('serif' as never, true)).toBe('serif');
  });
});

describe('offline cache', () => {
  it('round-trips and rejects garbage', () => {
    const cache = cacheFromCustomerInfo({
      entitlements: { active: { plus: { expirationDate: '2030-01-01T00:00:00Z' } } },
    });
    expect(cache.plus.active).toBe(true);
    expect(cache.adsFree.active).toBe(false);
    expect(parseCache(serializeCache(cache))).toEqual(cache);
    expect(parseCache('nope')).toBeNull();
    expect(parseCache(null)).toBeNull();
    expect(parseCache('{"plus":{"active":1}}')).toBeNull();
  });
  it('a grant lasts through the grace period after its end, then lapses', () => {
    const g = { active: true, expiresAt: 1000 };
    expect(grantActive(g, 1000 + OFFLINE_GRACE_MS - 1)).toBe(true);
    expect(grantActive(g, 1000 + OFFLINE_GRACE_MS)).toBe(false);
    expect(grantActive({ active: true, expiresAt: null }, 9e15)).toBe(true);
    expect(grantActive({ active: false, expiresAt: null }, 0)).toBe(false);
  });
});

describe('plans', () => {
  it('classifies packages', () => {
    expect(planKind('MONTHLY', '$rc_monthly')).toBe('monthly');
    expect(planKind('ANNUAL', '$rc_annual')).toBe('annual');
    expect(planKind('LIFETIME', '$rc_lifetime')).toBe('adsfree');
    expect(planKind('CUSTOM', 'x', 'erek_plus_monthly')).toBe('monthly');
    expect(planKind('CUSTOM', 'x', 'erek_plus_yearly')).toBe('annual');
    expect(planKind('CUSTOM', 'x', 'something')).toBe('other');
  });
  it('savings are whole percent, null when not cheaper', () => {
    expect(annualSavingsPercent(2.99, 19.99)).toBe(44);
    expect(annualSavingsPercent(1, 12)).toBeNull();
    expect(annualSavingsPercent(0, 10)).toBeNull();
  });
  it('trial days only for a free intro offer', () => {
    expect(trialDays({ price: 0, periodUnit: 'DAY', periodNumberOfUnits: 7 })).toBe(7);
    expect(trialDays({ price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1 })).toBe(7);
    expect(trialDays({ price: 1, periodUnit: 'DAY', periodNumberOfUnits: 7 })).toBeNull();
    expect(trialDays(null)).toBeNull();
  });
});
