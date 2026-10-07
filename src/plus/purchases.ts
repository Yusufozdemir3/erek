// The only place that talks to RevenueCat (react-native-purchases, which wraps
// Google Play Billing). Everything is optional by design:
//  - no EXPO_PUBLIC_REVENUECAT_ANDROID_KEY (local/dev builds) or no native
//    module (Expo Go, tests) → purchases are "not available": no plans, nothing
//    is bought, and the app stays fully unlocked;
//  - nothing here ever throws into the caller — failures come back as values.
//
// Privacy: no Erek account id is sent to RevenueCat. It uses its own anonymous
// id; a purchase follows the user through their Google Play account (Restore).

import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import { planKind, trialDays, type CustomerInfoLike, type PlanKind } from './plusLogic';

export interface Plan {
  id: string; // RevenueCat package identifier
  kind: PlanKind;
  priceString: string; // "₺49,99", already localized by Google Play
  price: number;
  trialDays: number | null; // free intro period, if the user is eligible
  raw: PurchasesPackage;
}

export type PurchaseResult =
  | { status: 'success'; info: CustomerInfoLike }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

type PurchasesModule = typeof import('react-native-purchases').default;

function load(): PurchasesModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-purchases').default;
  } catch {
    return null; // Expo Go / native module not compiled in
  }
}

// True when a purchase could actually go through on this build.
export function purchasesAvailable(): boolean {
  return Platform.OS === 'android' && !!API_KEY && load() !== null;
}

let configuring: Promise<boolean> | null = null;

// Idempotent; resolves false (never rejects) when purchases aren't available.
export function configurePurchases(): Promise<boolean> {
  if (!configuring) {
    configuring = (async () => {
      const rc = load();
      if (!rc || Platform.OS !== 'android' || !API_KEY) return false;
      try {
        rc.configure({ apiKey: API_KEY });
        return true;
      } catch (e) {
        console.warn('[Plus] RevenueCat yapılandırılamadı:', e);
        return false;
      }
    })();
  }
  return configuring;
}

// Monthly, yearly, ads-free, anything else last.
const ORDER: Record<PlanKind, number> = { monthly: 0, annual: 1, adsfree: 2, other: 3 };

export async function fetchPlans(): Promise<Plan[]> {
  const rc = load();
  if (!rc || !(await configurePurchases())) return [];
  try {
    const offerings = await rc.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    return packages
      .map(
        (p): Plan => ({
          id: p.identifier,
          kind: planKind(p.packageType, p.identifier, p.product.identifier),
          priceString: p.product.priceString,
          price: p.product.price,
          trialDays: trialDays(p.product.introPrice),
          raw: p,
        })
      )
      .sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  } catch (e) {
    console.warn('[Plus] Planlar alınamadı:', e);
    return [];
  }
}

export async function buyPlan(plan: Plan): Promise<PurchaseResult> {
  const rc = load();
  if (!rc || !(await configurePurchases())) return { status: 'error', message: 'unavailable' };
  try {
    const { customerInfo } = await rc.purchasePackage(plan.raw);
    return { status: 'success', info: customerInfo };
  } catch (e) {
    const err = e as { userCancelled?: boolean | null; message?: string };
    if (err?.userCancelled) return { status: 'cancelled' };
    return { status: 'error', message: String(err?.message ?? e) };
  }
}

// Restores purchases made with this Google Play account (new phone, reinstall).
export async function restorePurchases(): Promise<PurchaseResult> {
  const rc = load();
  if (!rc || !(await configurePurchases())) return { status: 'error', message: 'unavailable' };
  try {
    return { status: 'success', info: await rc.restorePurchases() };
  } catch (e) {
    return { status: 'error', message: String((e as Error)?.message ?? e) };
  }
}

export async function currentCustomerInfo(): Promise<CustomerInfoLike | null> {
  const rc = load();
  if (!rc || !(await configurePurchases())) return null;
  try {
    return await rc.getCustomerInfo();
  } catch {
    return null; // offline: the cached answer stays in force
  }
}

// Calls back whenever the store's answer changes (purchase, renewal, expiry,
// refund). Returns the unsubscribe function.
export function listenCustomerInfo(callback: (info: CustomerInfo) => void): () => void {
  const rc = load();
  if (!rc || Platform.OS !== 'android' || !API_KEY) return () => {};
  rc.addCustomerInfoUpdateListener(callback);
  return () => {
    rc.removeCustomerInfoUpdateListener(callback);
  };
}
