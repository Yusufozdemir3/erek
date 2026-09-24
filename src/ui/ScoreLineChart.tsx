// Score chart — NO SVG, drawn entirely with plain React Native Views (per user
// request). Since the chart is "stepped," each segment is already an
// axis-aligned rectangle: a horizontal piece + a vertical piece. The old 'line'
// variant, which needed diagonal strokes, was REMOVED — it was never used (the
// only caller, habit/[id].tsx, always passed variant="step"); a diagonal line
// with Views would only be possible via a rotation trick and wasn't worth it.
// Can be recovered from git history if ever needed.
//
// UNIT: everything is in raw pixels (dp). There used to be an SVG viewBox, and
// since the viewBox's aspect ratio didn't match the drawing box's, the default
// preserveAspectRatio ("xMidYMid meet") shrank the whole chart to 68% and
// centered it — dead space on the sides, 5.4px text instead of 8px, and bottom
// axis labels drifting away from their points. With no scaling layer, that whole
// class of bug is no longer possible: what you write is what you get.
//
// LAYOUT: two parts side by side. LEFT is the percentage axis (%0..%100) — FIXED,
// OUTSIDE the ScrollView; RIGHT is the scrollable plot area. The axis used to be
// inside the scroll area too, and scrolling into the past would push the
// percentages off-screen, leaving the chart without a scale (user request: "pin
// the percentages to the left, only the days should move"). That's why the plot
// area's x coordinates start at 0 — the axis width (AXIS_W) is NOT part of the plot.
//
// With few points (e.g. only 4 weeks), point spacing stretches to FILL the
// container — otherwise the chart would hug the left edge and leave an ugly gap
// on the right (user feedback). As the point count grows, spacing shrinks down to
// the minimum width (POINT_SPACING_MIN) and the ScrollView kicks in to scroll.

import { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, ScrollView, Text, View } from 'react-native';
import { AXIS_W, chartLayout } from '@/ui/scoreChartLayout';

// SCALE: reference is the Loop Habit Tracker's score chart (from a user video).
// The old values (110px height, 8px text) looked squashed next to the "History"
// card and the text was unreadable on a phone (user feedback: "doesn't fit the
// screen right, text is too small"). Loop's plot area is ~145dp, axis/day labels
// ~10dp; the numbers here match its proportions.
// POINT_SPACING_MIN / AXIS_W / LABEL_W_MAX -> scoreChartLayout.ts (kept together
// with the layout math).
// Gap between the percentage label and the plot area. Labels are right-aligned
// within the strip (so the numbers' right edges line up); enlarging this margin
// shifts them all further left — at 6 they hugged the line too closely (user request).
const AXIS_GAP = 14;
// Height of the plot area and the y position of the %100 / %0 lines within it.
// The space below Y_BASE is breathing room before the bottom axis label row.
const CHART_H = 172;
const Y_TOP = 12;
const Y_BASE = 156;
// Width of the bottom axis label box: can't be wider than the point spacing (or
// neighboring labels would overlap), but is also capped at this value when
// spacing stretches wide with few points — either way, the label is always
// centered directly OVER its own point.
const LABEL_ROW_H = 16;
const LABEL_FONT = 10;
const AXIS_FONT = 10;
const AXIS_LINE_H = 12;
const GRID_STEPS = [0, 20, 40, 60, 80, 100];
const STROKE = 2.5; // line thickness
const DOT_R = 3.5;
const DOT_R_LAST = 5; // last point is emphasized
const PARTIAL_OPACITY = 0.4; // unfinished bucket: faded
const DASH_LEN = 4; // unfinished tail: 4px dash / 3px gap
const DASH_GAP = 3;

// An absolutely positioned rectangle (a line segment). The entire drawing is made of these.
interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// The STEP between two points: go horizontal at a.y's level first, then move
// vertically up/down at b.x. The vertical segment overhangs by STROKE/2 on both
// ends so no gap is left at the corner (the equivalent of SVG's strokeLinejoin="round").
function stepRects(a: { x: number; y: number }, b: { x: number; y: number }): Rect[] {
  return [
    { left: a.x, top: a.y - STROKE / 2, width: b.x - a.x, height: STROKE },
    {
      left: b.x - STROKE / 2,
      top: Math.min(a.y, b.y) - STROKE / 2,
      width: STROKE,
      height: Math.abs(b.y - a.y) + STROKE,
    },
  ];
}

// Splits a segment into a dashed line (the equivalent of SVG's strokeDasharray="4,3").
// DASH_LEN-long pieces along the segment's long axis, with DASH_GAP between them.
function dashRects(seg: Rect): Rect[] {
  const horizontal = seg.width >= seg.height;
  const len = horizontal ? seg.width : seg.height;
  const out: Rect[] = [];
  for (let offset = 0; offset < len; offset += DASH_LEN + DASH_GAP) {
    const size = Math.min(DASH_LEN, len - offset);
    out.push(
      horizontal
        ? { ...seg, left: seg.left + offset, width: size }
        : { ...seg, top: seg.top + offset, height: size }
    );
  }
  return out;
}

export interface ScoreLineChartProps {
  /** A 0..1 value per point + a short label shown on the bottom axis.
   *  partial=true: this point belongs to a bucket that is NOT YET FINISHED
   *  (today / the ongoing week-month) — drawn faded/dashed, the same visual
   *  language as the partial buckets on the "History" card (user feedback: an
   *  unfinished period looked like it had already finished). */
  points: { value: number; label: string; partial?: boolean }[];
  color: string;
  gridColor: string;
  labelColor: string;
}

export function ScoreLineChart({ points, color, gridColor, labelColor }: ScoreLineChartProps) {
  const n = points.length;
  const [containerWidth, setContainerWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width);

  const scrollRef = useRef<ScrollView>(null);
  // Only auto-scroll to the end on the FIRST measurement — onContentSizeChange
  // could re-fire on every re-render (e.g. when stats refresh on screen focus),
  // and would yank the view back "to the right" while the user was scrolling
  // manually, breaking their scroll (user feedback).
  const didAutoScroll = useRef(false);
  // ...BUT the component doesn't remount when the period tab (Day/Week/Month)
  // changes, only the point count changes. Since the flag stayed set, the
  // auto-scroll was skipped and the user was left in the middle/left of the new
  // chart; the "latest data on the right" guarantee broke on the very first tab
  // switch. We reset the flag whenever the point count changes — since refreshed
  // stats return the same number of buckets otherwise, manual scrolling still
  // isn't disrupted.
  useEffect(() => {
    didAutoScroll.current = false;
  }, [n]);

  if (n === 0) return <View onLayout={onLayout} />;

  // Layout math lives in a pure module (testable): scoreChartLayout.ts
  const { spacing, labelW, plotW, xAt } = chartLayout(n, containerWidth);
  const yAt = (v: number) => Y_BASE - Math.max(0, Math.min(1, v)) * (Y_BASE - Y_TOP);
  const coords = points.map((p, i) => ({ x: xAt(i), y: yAt(p.value) }));

  // If the last point belongs to an unfinished bucket (today / the ongoing
  // week-month), the final segment leading to it is drawn separately as a
  // faded/dashed "tail" — the main line stops before it. In a single-point
  // chart there's no second point for a tail.
  const lastIsPartial = n > 1 && points[n - 1].partial === true;
  const lineEnd = lastIsPartial ? n - 1 : n; // number of points included in the main line

  const solidRects: Rect[] = [];
  for (let i = 1; i < lineEnd; i++) solidRects.push(...stepRects(coords[i - 1], coords[i]));
  const tailRects: Rect[] = lastIsPartial
    ? stepRects(coords[n - 2], coords[n - 1]).flatMap(dashRects)
    : [];

  return (
    <View onLayout={onLayout}>
      {containerWidth > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {/* FIXED left axis — outside the scroll area, always visible. The
              percentage labels use the SAME yAt() formula as the plot area, both
              at CHART_H height; the rows stay pixel-aligned. */}
          <View style={{ width: AXIS_W, height: CHART_H }}>
            {GRID_STEPS.map((g) => (
              <Text
                key={g}
                numberOfLines={1}
                style={{
                  position: 'absolute',
                  top: yAt(g / 100) - AXIS_LINE_H / 2,
                  width: AXIS_W - AXIS_GAP,
                  lineHeight: AXIS_LINE_H,
                  fontSize: AXIS_FONT,
                  color: labelColor,
                  textAlign: 'right',
                }}
              >
                {`%${g}`}
              </Text>
            ))}
          </View>
          {/* The most recent data (right edge) is the default view — it
              auto-scrolls there on open, and the user scrolls LEFT to go back in
              history. nestedScrollEnabled: this horizontal ScrollView is INSIDE
              the VERTICAL ScrollView wrapping the screen — on Android, without
              this the outer scroll would capture the swipe gesture and horizontal
              scrolling would feel "stuck/unresponsive". */}
          <ScrollView
            ref={scrollRef}
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            onContentSizeChange={() => {
              if (didAutoScroll.current) return;
              didAutoScroll.current = true;
              scrollRef.current?.scrollToEnd({ animated: false });
            }}
          >
            <View>
              <View style={{ width: plotW, height: CHART_H }}>
                {/* Grid lines stay INSIDE the plot area (axis labels are
                    outside): since the horizontal lines span the full content
                    width, they appear to stay fixed while scrolling. */}
                {GRID_STEPS.map((g) => (
                  <View
                    key={g}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: yAt(g / 100),
                      width: plotW,
                      height: 1,
                      backgroundColor: gridColor,
                    }}
                  />
                ))}
                {solidRects.map((r, i) => (
                  <View key={`s${i}`} style={{ position: 'absolute', backgroundColor: color, ...r }} />
                ))}
                {tailRects.map((r, i) => (
                  <View
                    key={`t${i}`}
                    style={{ position: 'absolute', backgroundColor: color, opacity: PARTIAL_OPACITY, ...r }}
                  />
                ))}
                {coords.map((c, i) => {
                  const r = i === n - 1 ? DOT_R_LAST : DOT_R;
                  return (
                    <View
                      key={`d${i}`}
                      style={{
                        position: 'absolute',
                        left: c.x - r,
                        top: c.y - r,
                        width: r * 2,
                        height: r * 2,
                        borderRadius: r,
                        backgroundColor: color,
                        opacity: points[i].partial ? PARTIAL_OPACITY : 1,
                      }}
                    />
                  );
                })}
              </View>
              {/* Labels must stay ALIGNED with the points. This row used to be a
                  flex row starting at x=0, with each label centered in its own
                  `spacing` box — meaning label i's center landed at
                  (i+0.5)*spacing, while point i sits at xAt(i). There was a
                  constant drift (point showing Jul 12 had Jul 11 written under
                  it). Now every label is absolutely positioned and centered
                  directly over its own point; since the box width is capped at
                  LABEL_W_MAX, the label doesn't drift away from the point even
                  when spacing stretches wide. Absolute positioning also prevents
                  overflowing edge labels from inflating the ScrollView's content
                  width. */}
              <View style={{ width: plotW, height: LABEL_ROW_H }}>
                {points.map((p, i) => (
                  <Text
                    key={i}
                    style={{
                      position: 'absolute',
                      left: xAt(i) - labelW / 2,
                      width: labelW,
                      fontSize: LABEL_FONT,
                      // Line height matches the box — on Android, if the font
                      // metrics exceed LABEL_ROW_H the label gets clipped at the bottom.
                      lineHeight: LABEL_ROW_H,
                      fontWeight: '600',
                      color: labelColor,
                      textAlign: 'center',
                    }}
                    numberOfLines={1}
                  >
                    {p.label}
                  </Text>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}
