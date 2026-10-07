// Erek Plus — the pure rules: what is free, what Plus unlocks, how a stored
// purchase counts while the phone is offline, and the introductory period. No
// react-native or SDK import, so the Node test project covers it.
//
// Tiers (docs/monetization.md):
//   free     — everything core, with ads, plus the limits below
//   ads-free — a one-time purchase that only removes ads
//   Plus     — a subscription that lifts every limit (ads removed too)
//
// With billing unavailable (no RevenueCat key, Expo Go) nothing is limited:
// the limits exist only where there is a way to lift them.

import type { AccentKey } from '@/ui/theme';
import type { FontChoice } from '@/ui/fontFamily';
import { MAX_REMINDERS_PER_ENTITY } from '@/ui/formLimits';

// RevenueCat entitlement ids granted by the store products.
export const PLUS_ENTITLEMENT = 'plus';
export const ADS_FREE_ENTITLEMENT = 'ads_free';

// Every limit is lifted for this long after the first run of a build that can
// sell (new installs and existing users alike), so nobody wakes up locked out.
export const INTRO_DAYS = 30;
export const INTRO_MS = INTRO_DAYS * 24 * 60 * 60 * 1000;

// — Free-tier limits —
export const FREE_REMINDERS_PER_ITEM = 1;
export const FREE_FRIENDS = 1;
// Stats charts: only the Day tab (the last 30 days) is free.
export const FREE_CHART_PERIODS = ['day'] as const;
// The month calendar may go back this many months (0 = this month only).
export const FREE_CALENDAR_MONTHS_BACK = 1;
// Widgets that work without Plus: the Today and quick-add ones.
export const FREE_WIDGETS = ['ErekToday', 'ErekQuickAdd'] as const;

export interface PlusState {
  billing: boolean; // a purchase could go through on this build
  plus: boolean; // Plus subscription active
  adsFree: boolean; // the one-time ads-free purchase
  introEndsAt: number | null; // end of the introductory period (epoch ms)
}

export const INITIAL_STATE: PlusState = { billing: false, plus: false, adsFree: false, introEndsAt: null };

// Are the Plus features open right now? Yes when there is nothing to buy, while
// the introductory period runs, or when Plus is active.
export function featuresUnlocked(state: PlusState, now: number = Date.now()): boolean {
  if (!state.billing || state.plus) return true;
  return state.introEndsAt !== null && now < state.introEndsAt;
}

// Ads stay on until something removes them (Plus or the ads-free purchase) —
// billing being unavailable does NOT remove them.
export function adsRemoved(state: PlusState): boolean {
  return state.plus || state.adsFree;
}

export function reminderLimit(unlocked: boolean): number {
  return unlocked ? MAX_REMINDERS_PER_ENTITY : FREE_REMINDERS_PER_ITEM;
}

export function canAddFriend(unlocked: boolean, currentFriends: number): boolean {
  return unlocked || currentFriends < FREE_FRIENDS;
}

export function isChartPeriodFree(period: string): boolean {
  return (FREE_CHART_PERIODS as readonly string[]).includes(period);
}

export function isWidgetFree(name: string): boolean {
  return (FREE_WIDGETS as readonly string[]).includes(name);
}

// Accent colors anyone can use; the others are Plus. The first is the fallback.
export const FREE_ACCENTS: readonly AccentKey[] = ['pine', 'terracotta', 'ink'];

export function isAccentFree(accent: AccentKey): boolean {
  return FREE_ACCENTS.includes(accent);
}

// A Plus-only accent falls back while locked; the saved choice is kept, so it
// returns with Plus.
export function effectiveAccent(accent: AccentKey, unlocked: boolean): AccentKey {
  return unlocked || isAccentFree(accent) ? accent : FREE_ACCENTS[0];
}

// Only the phone's own typeface is free.
export function isFontFree(choice: FontChoice): boolean {
  return choice === 'system';
}

export function effectiveFont(choice: FontChoice, unlocked: boolean): FontChoice {
  return unlocked || isFontFree(choice) ? choice : 'system';
}

// — Offline entitlement cache —
// "Is the user entitled?" must be answerable at launch without the network. The
// last answer from the store is cached with when each period ends; a few days
// of grace cover a phone that simply hasn't been online to renew the record.

export const OFFLINE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export interface Grant {
  active: boolean;
  expiresAt: number | null; // end of the paid period; null = no end (one-time / unknown)
}

export interface PlusCache {
  plus: Grant;
  adsFree: Grant;
}

const NONE: Grant = { active: false, expiresAt: null };

export function serializeCache(cache: PlusCache): string {
  return JSON.stringify(cache);
}

function parseGrant(v: unknown): Grant | null {
  if (!v || typeof v !== 'object') return null;
  const g = v as Partial<Grant>;
  if (typeof g.active !== 'boolean') return null;
  if (g.expiresAt !== null && typeof g.expiresAt !== 'number') return null;
  return { active: g.active, expiresAt: g.expiresAt };
}

export function parseCache(raw: string | null | undefined): PlusCache | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { plus?: unknown; adsFree?: unknown };
    const plus = parseGrant(v.plus);
    const adsFree = parseGrant(v.adsFree);
    return plus && adsFree ? { plus, adsFree } : null;
  } catch {
    return null;
  }
}

export function grantActive(grant: Grant, now: number): boolean {
  if (!grant.active) return false;
  if (grant.expiresAt === null) return true;
  return now < grant.expiresAt + OFFLINE_GRACE_MS;
}

// The shape of RevenueCat's CustomerInfo that matters here.
export interface CustomerInfoLike {
  entitlements: { active: Record<string, { expirationDate?: string | null } | undefined> };
}

function grantFrom(info: CustomerInfoLike, id: string): Grant {
  const entry = info.entitlements.active[id];
  if (!entry) return NONE;
  const parsed = entry.expirationDate ? Date.parse(entry.expirationDate) : NaN;
  return { active: true, expiresAt: Number.isFinite(parsed) ? parsed : null };
}

export function cacheFromCustomerInfo(info: CustomerInfoLike): PlusCache {
  return { plus: grantFrom(info, PLUS_ENTITLEMENT), adsFree: grantFrom(info, ADS_FREE_ENTITLEMENT) };
}

// — Plans (what the paywall lists) —

export type PlanKind = 'monthly' | 'annual' | 'adsfree' | 'other';

// RevenueCat's package type / identifier win; the store product id is the fallback.
export function planKind(packageType: string, identifier: string, productId: string = ''): PlanKind {
  const id = `${identifier} ${productId}`.toLowerCase();
  if (packageType === 'LIFETIME' || identifier === '$rc_lifetime' || /ads|lifetime/.test(id)) return 'adsfree';
  if (packageType === 'MONTHLY' || identifier === '$rc_monthly') return 'monthly';
  if (packageType === 'ANNUAL' || identifier === '$rc_annual') return 'annual';
  if (/month/.test(id)) return 'monthly';
  if (/year|annual/.test(id)) return 'annual';
  return 'other';
}

// How much cheaper the yearly plan is than twelve monthly payments, in whole
// percent; null when it isn't cheaper (or a price is missing).
export function annualSavingsPercent(monthlyPrice: number, annualPrice: number): number | null {
  if (!(monthlyPrice > 0) || !(annualPrice > 0)) return null;
  const pct = Math.round((1 - annualPrice / (monthlyPrice * 12)) * 100);
  return pct > 0 ? pct : null;
}

// Length of a FREE intro period in days (a trial), or null when the intro offer
// isn't free or doesn't exist.
export function trialDays(
  intro: { price: number; periodUnit: string; periodNumberOfUnits: number } | null | undefined
): number | null {
  if (!intro || intro.price !== 0 || !(intro.periodNumberOfUnits > 0)) return null;
  const perUnit: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };
  const unit = perUnit[intro.periodUnit];
  return unit ? unit * intro.periodNumberOfUnits : null;
}
