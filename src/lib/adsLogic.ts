// The interstitial's frequency gate (pure).

// At most one full-screen ad per this gap. Lives here (not in ads.ts, which pulls
// in the native ads module) so the Privacy page can state the real number.
export const INTERSTITIAL_MIN_GAP_MS = 30 * 60 * 1000;

// lastShownAt null = no record (first launch or cleared storage): no ad; the
// caller starts the clock instead, so a new user never meets an ad right away.
export function shouldShowInterstitial(
  lastShownAt: number | null,
  now: number,
  minGapMs: number
): boolean {
  if (lastShownAt === null) return false;
  return now - lastShownAt >= minGapMs;
}
