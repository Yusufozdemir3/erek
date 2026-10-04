// Pure helpers (no react-native-android-widget import) for the MIUI size
// mismatch described in renderWidgets.tsx. The same formula lives in the
// library patch (patches/react-native-android-widget+*.patch), which uses it to
// place tap areas — keep the two in step.

export const MIUI_OVERSHOOT_RATIO = 0.08;
export const MIUI_MIN_OVERSHOOT_DP = 16;

// dp the launcher reports beyond the visible frame, for a reported size of `dp`.
export function overshootDp(dp?: number): number {
  return Math.max(MIUI_MIN_OVERSHOOT_DP, Math.round((dp ?? 0) * MIUI_OVERSHOOT_RATIO));
}
