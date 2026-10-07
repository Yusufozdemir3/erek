// The stepped score chart, drawn with plain Views (no SVG): every step is an
// axis-aligned rectangle, and sizes are raw dp — no viewBox scaling to drift.
//
// The % axis is fixed on the LEFT, outside the horizontal ScrollView, so it
// stays visible while the days scroll; plot x coordinates start at 0. With
// few points the spacing stretches to fill the width, down to
// POINT_SPACING_MIN, after which it scrolls (scoreChartLayout.ts).

import { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, ScrollView, Text, View } from 'react-native';
import { AXIS_W, chartLayout } from '@/ui/scoreChartLayout';
import { percentLabel } from '@/ui/theme';
import type { Lang } from '@/i18n/translations';

// Proportions follow Loop Habit Tracker's chart. Horizontal sizes live in
// scoreChartLayout.ts. AXIS_GAP: between the right-aligned % labels and the plot.
const AXIS_GAP = 14;
// Plot height and the 100% / 0% lines; below Y_BASE is room before the labels.
const CHART_H = 172;
const Y_TOP = 12;
const Y_BASE = 156;
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

// An absolutely positioned rectangle; the whole drawing is made of these.
interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Horizontal at a.y, then vertical at b.x; the vertical piece overhangs by
// STROKE/2 so the corner has no gap.
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

// A segment as dashes (DASH_LEN on, DASH_GAP off).
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
  /** 0..1 per point + its axis label; partial = an unfinished bucket, drawn faded/dashed. */
  points: { value: number; label: string; partial?: boolean }[];
  color: string;
  gridColor: string;
  labelColor: string;
  lang: Lang;
}

export function ScoreLineChart({ points, color, gridColor, labelColor, lang }: ScoreLineChartProps) {
  const n = points.length;
  const [containerWidth, setContainerWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width);

  const scrollRef = useRef<ScrollView>(null);
  // Scroll to the newest point once, not on every re-render (it would yank the
  // user's own scrolling back)...
  const didAutoScroll = useRef(false);
  // ...but again when the point count changes (a Day/Week/Month switch doesn't remount).
  useEffect(() => {
    didAutoScroll.current = false;
  }, [n]);

  if (n === 0) return <View onLayout={onLayout} />;

  const { labelW, plotW, xAt } = chartLayout(n, containerWidth);
  const yAt = (v: number) => Y_BASE - Math.max(0, Math.min(1, v)) * (Y_BASE - Y_TOP);
  const coords = points.map((p, i) => ({ x: xAt(i), y: yAt(p.value) }));

  // An unfinished last bucket gets a separate faded, dashed tail.
  const lastIsPartial = n > 1 && points[n - 1].partial === true;
  const lineEnd = lastIsPartial ? n - 1 : n; // points in the main line

  const solidRects: Rect[] = [];
  for (let i = 1; i < lineEnd; i++) solidRects.push(...stepRects(coords[i - 1], coords[i]));
  const tailRects: Rect[] = lastIsPartial
    ? stepRects(coords[n - 2], coords[n - 1]).flatMap(dashRects)
    : [];

  return (
    <View onLayout={onLayout}>
      {containerWidth > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {/* The fixed axis uses the same yAt() as the plot, so rows align. */}
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
                {percentLabel(g, lang)}
              </Text>
            ))}
          </View>
          {/* Opens at the newest data; nestedScrollEnabled keeps Android's outer
              vertical ScrollView from swallowing horizontal swipes. */}
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
              {/* Each label is absolutely centered on its own point (a flex row
                  drifted half a step), and can't widen the scroll content. */}
              <View style={{ width: plotW, height: LABEL_ROW_H }}>
                {points.map((p, i) => (
                  <Text
                    key={i}
                    style={{
                      position: 'absolute',
                      left: xAt(i) - labelW / 2,
                      width: labelW,
                      fontSize: LABEL_FONT,
                      // Otherwise Android clips the bottom of the text.
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
