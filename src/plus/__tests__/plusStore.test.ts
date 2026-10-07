import AsyncStorage from '@react-native-async-storage/async-storage';

let mockAvailable = true;
jest.mock('../purchases', () => ({
  purchasesAvailable: () => mockAvailable,
  configurePurchases: async () => false,
  currentCustomerInfo: async () => null,
  listenCustomerInfo: () => () => {},
}));

import { INTRO_MS } from '../plusLogic';
import {
  applyCustomerInfo,
  areFeaturesUnlocked,
  getPlusState,
  INTRO_START_KEY,
  initPlus,
  isAdsRemoved,
  PLUS_CACHE_KEY,
  subscribePlus,
} from '../plusStore';

beforeEach(async () => {
  await AsyncStorage.clear();
  mockAvailable = true;
});

describe('initPlus', () => {
  it('without billing: unlocked, ads still on, no intro clock', async () => {
    mockAvailable = false;
    await initPlus(1000);
    expect(getPlusState().billing).toBe(false);
    expect(areFeaturesUnlocked()).toBe(true);
    expect(isAdsRemoved()).toBe(false);
    expect(await AsyncStorage.getItem(INTRO_START_KEY)).toBeNull();
  });

  it('with billing: starts the intro period once and keeps its start', async () => {
    const start = Date.now();
    await initPlus(start);
    expect(getPlusState().introEndsAt).toBe(start + INTRO_MS);
    expect(areFeaturesUnlocked()).toBe(true);
    await initPlus(start + 5000);
    expect(getPlusState().introEndsAt).toBe(start + INTRO_MS);
  });

  it('locks after the intro period and unlocks from the cached Plus', async () => {
    await AsyncStorage.setItem(INTRO_START_KEY, '1');
    await initPlus(INTRO_MS + 10);
    expect(areFeaturesUnlocked()).toBe(false);

    await AsyncStorage.setItem(
      PLUS_CACHE_KEY,
      JSON.stringify({ plus: { active: true, expiresAt: null }, adsFree: { active: false, expiresAt: null } })
    );
    await initPlus(INTRO_MS + 10);
    expect(getPlusState().plus).toBe(true);
    expect(areFeaturesUnlocked()).toBe(true);
    expect(isAdsRemoved()).toBe(true);
  });
});

describe('applyCustomerInfo', () => {
  it('publishes a purchase, caches it and notifies once', async () => {
    await AsyncStorage.setItem(INTRO_START_KEY, '1');
    await initPlus(INTRO_MS + 10);
    const listener = jest.fn();
    const off = subscribePlus(listener);

    applyCustomerInfo({ entitlements: { active: { ads_free: {} } } });
    expect(getPlusState().adsFree).toBe(true);
    expect(isAdsRemoved()).toBe(true);
    expect(areFeaturesUnlocked()).toBe(false); // ads-free is not Plus
    expect(listener).toHaveBeenCalledTimes(1);

    applyCustomerInfo({ entitlements: { active: { ads_free: {} } } });
    expect(listener).toHaveBeenCalledTimes(1); // unchanged → no repaint

    off();
    expect(JSON.parse((await AsyncStorage.getItem(PLUS_CACHE_KEY)) as string).adsFree.active).toBe(true);
  });

  it('a lapsed subscription locks again', async () => {
    await AsyncStorage.setItem(INTRO_START_KEY, '1');
    await initPlus(INTRO_MS + 10);
    applyCustomerInfo({ entitlements: { active: { plus: {} } } });
    expect(areFeaturesUnlocked()).toBe(true);
    applyCustomerInfo({ entitlements: { active: {} } });
    expect(areFeaturesUnlocked()).toBe(false);
  });
});
