// LAYOUT math for the score chart — SPLIT OUT from ScoreLineChart.tsx.
// Since it has no React dependency, it can be verified directly in the 'logic'
// test project; a silent regression here can make the chart invisible (see the
// note below).

// MINIMUM pixels per point (never goes below this; below it, scrolling kicks in).
export const POINT_SPACING_MIN = 30;
// Width of the FIXED left axis strip (sized for the "%100" label).
export const AXIS_W = 40;
// UPPER BOUND of the bottom axis label box: can't be wider than the point
// spacing (or neighboring labels would overlap), and also caps it when spacing
// stretches wide with few points.
export const LABEL_W_MAX = 48;

export interface ChartLayout {
  spacing: number; // distance between two points
  labelW: number; // width of the bottom axis label box
  plotW: number; // TOTAL width of the scrollable plot area
  xAt: (i: number) => number; // x position of point i
}

// Solves the layout for n points and a measured container width.
//
// There are two regimes, because the label box is min(spacing, LABEL_W_MAX):
//   narrow (labelW = spacing)     -> plotW = n * spacing
//   wide   (labelW = LABEL_W_MAX) -> plotW = (n-1) * spacing + LABEL_W_MAX
// Whichever applies is solved for; both give plotW = availableForPlot, meaning
// the chart card is filled EXACTLY. Since the first/last point's label overflows
// by half a box, that margin is accounted for — otherwise even a chart that
// should fit exactly would become scrollable.
//
// SINGLE POINT (n=1) SPECIAL CASE: plotW used to be computed as
// `Math.max(1, n - 1) * spacing + labelW`; at n=1, max(1,0)=1 inflated the plot
// area by one FULL spacing, overflowing the screen, so the ScrollView auto-scrolled
// to the end on open and the single point was left off-screen to the left — the
// chart appeared EMPTY (caught on the emulator on 2026-07-23). This only became
// reachable once the score gate (SCORE_MIN_DAYS) was removed: before that, the
// chart was never rendered with less than 7 days of data.
export function chartLayout(n: number, containerWidth: number): ChartLayout {
  const availableForPlot = Math.max(0, containerWidth - AXIS_W);
  const narrowFit = availableForPlot / Math.max(1, n);
  const fitSpacing =
    narrowFit < LABEL_W_MAX
      ? narrowFit
      : n > 1
        ? (availableForPlot - LABEL_W_MAX) / (n - 1)
        : availableForPlot;
  const spacing = containerWidth > 0 ? Math.max(POINT_SPACING_MIN, fitSpacing) : POINT_SPACING_MIN;
  const labelW = Math.min(spacing, LABEL_W_MAX);
  // At n<=1 there is NO spacing: the width is just the label box.
  const plotW = (n > 1 ? (n - 1) * spacing : 0) + labelW;
  return { spacing, labelW, plotW, xAt: (i: number) => labelW / 2 + i * spacing };
}
