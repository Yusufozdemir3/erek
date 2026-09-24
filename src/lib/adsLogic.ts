// FREQUENCY GATE for the interstitial ad — pure logic, testable without
// React/native modules (same rationale as timerLogic.ts).

// lastShownAt: the moment (epoch ms) the ad was last shown on this device.
//   null = there is NO record at all on this device — either this is truly
//   the first check, or AsyncStorage was cleared. In this case the CALLER
//   should behave as if it were "just shown," seeding the timestamp with now,
//   but should NOT show the ad (see ads.ts) — so that on first install, the
//   user doesn't hit a full-screen ad right after the onboarding/login screens
//   before they even know the app.
export function shouldShowInterstitial(
  lastShownAt: number | null,
  now: number,
  minGapMs: number
): boolean {
  if (lastShownAt === null) return false;
  return now - lastShownAt >= minGapMs;
}
