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

// Closing a full-screen ad brings the app to the foreground again. The
// foreground work (widget repaint, sync, reminders) ran for that "return" too,
// on the JS thread, right as the ad's close animation played: the freeze on
// close. It ran just before the ad anyway, so it is skipped while an ad is up
// and for a moment after.
export const AD_RETURN_GRACE_MS = 4000;

export function isAdTransition(showing: boolean, closedAt: number | null, now: number): boolean {
  if (showing) return true;
  return closedAt !== null && now - closedAt < AD_RETURN_GRACE_MS;
}
