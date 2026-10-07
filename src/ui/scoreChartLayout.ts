// Layout math of the score chart (pure). A mistake here can make the chart
// invisible — see the single-point note below.

// Minimum px per point; below it the chart scrolls.
export const POINT_SPACING_MIN = 30;
// The fixed % axis (fits "%100").
export const AXIS_W = 40;
// A bottom label is min(spacing, this) wide, so labels never overlap.
export const LABEL_W_MAX = 48;

export interface ChartLayout {
  spacing: number; // distance between two points
  labelW: number; // width of the bottom axis label box
  plotW: number; // the whole scrollable width
  xAt: (i: number) => number; // x position of point i
}

// Lays out n points in a measured width. Two regimes, since the label box is
// min(spacing, LABEL_W_MAX):
//   narrow (labelW = spacing)     -> plotW = n * spacing
//   wide   (labelW = LABEL_W_MAX) -> plotW = (n-1) * spacing + LABEL_W_MAX
// Either fills the card exactly; the half-label overhang at both ends is
// included, or a fitting chart would scroll.
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
  // n <= 1 has no spacing at all; adding one would push the only point off-screen.
  const plotW = (n > 1 ? (n - 1) * spacing : 0) + labelW;
  return { spacing, labelW, plotW, xAt: (i: number) => labelW / 2 + i * spacing };
}
