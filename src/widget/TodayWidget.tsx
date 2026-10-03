// The VIEW of the home-screen widget. Rendered with
// react-native-android-widget's own components (FlexWidget/TextWidget) — NOT
// RN View/StyleSheet; these components get converted into Android
// RemoteViews. Colors/data come from the snapshot (see widgetSnapshot.ts).
//
// TAPS: a binary habit's row checks it off / un-checks it, a numeric habit's
// row adds +1 — both handled in the background without opening the app (see
// widgetQueue.ts). A timer habit's row and everything outside the rows open
// the app (the default route = the Today tab). A snapshot from an earlier day
// takes no taps: it shows "open to refresh" and the whole card opens the app.
//
// IMPORTANT: this file imports react-native-android-widget; that package's
// barrel must not load when there's no native module, i.e. in Expo Go. That's
// why TodayWidget is only ever loaded in a real build (widgetData's lazy
// require + the headless task handler); it is NEVER imported from the app's normal screen tree.

import * as React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { FALLBACK_COLORS, type WidgetHabit, type WidgetSnapshot } from './widgetSnapshot';
import { INC_ACTION, TOGGLE_ACTION, habitKind, isStale } from './widgetQueue';

// The library wants colors as the `#rrggbb` template type; since the palette
// keeps plain strings, we narrow it safely from a single spot.
export const hex = (s: string) => s as `#${string}`;

// Max number of rows to show so it fits the widget; anything beyond is summarized as "+N".
const MAX_ROWS = 7;

// "3/8" for a numeric habit (just "3" without a target).
export function amountLabel(h: WidgetHabit): string {
  const amount = h.amount ?? 0;
  return h.target != null && h.target > 0 ? `${amount}/${h.target}` : String(amount);
}

// What tapping a row does: toggle / +1 in the background, or open the app.
function rowClick(h: WidgetHabit): { clickAction: string; clickActionData?: Record<string, unknown> } {
  const kind = habitKind(h);
  if (kind === 'binary') return { clickAction: TOGGLE_ACTION, clickActionData: { habitId: h.id } };
  if (kind === 'numeric') return { clickAction: INC_ACTION, clickActionData: { habitId: h.id } };
  return { clickAction: 'OPEN_APP' };
}

export function TodayWidget({ snapshot }: { snapshot: WidgetSnapshot | null }) {
  const c = snapshot?.colors ?? FALLBACK_COLORS;
  const stale = isStale(snapshot);
  const habits = stale ? [] : snapshot?.habits ?? [];
  const visible = habits.slice(0, MAX_ROWS);
  const overflow = habits.length - visible.length;
  const emptyText = stale ? snapshot?.staleLabel ?? '' : snapshot?.emptyLabel ?? '';

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: hex(c.bg),
        borderRadius: 16,
        padding: 14,
      }}
    >
      {/* Title + summary */}
      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <TextWidget
          text={snapshot?.title ?? 'Erek'}
          style={{ fontSize: 16, fontWeight: '700', color: hex(c.text) }}
        />
        {snapshot && !stale && snapshot.totalCount > 0 ? (
          <TextWidget
            text={snapshot.summaryLabel}
            style={{ fontSize: 13, fontWeight: '600', color: hex(c.primary) }}
          />
        ) : (
          <TextWidget text="" style={{ fontSize: 13, color: hex(c.faint) }} />
        )}
      </FlexWidget>

      {/* List or empty/stale state */}
      {visible.length === 0 ? (
        <TextWidget text={emptyText} style={{ fontSize: 13, color: hex(c.muted), marginTop: 12 }} />
      ) : (
        visible.map((h) => {
          const numeric = habitKind(h) === 'numeric';
          return (
            <FlexWidget
              key={h.id}
              {...rowClick(h)}
              style={{
                width: 'match_parent',
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: 4,
                paddingVertical: 5,
              }}
            >
              {/* Color dot (the habit's color) */}
              <FlexWidget
                style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: hex(h.color) }}
              />
              {/* Title — fills the remaining space, truncated if it overflows */}
              <FlexWidget style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
                <TextWidget
                  text={h.title}
                  maxLines={1}
                  truncate="END"
                  style={{ fontSize: 14, color: h.completed ? hex(c.faint) : hex(c.text) }}
                />
              </FlexWidget>
              {/* Status: amount for numeric habits, a check mark otherwise */}
              <TextWidget
                text={numeric && !h.completed ? `${amountLabel(h)} ＋` : h.completed ? '✓' : '○'}
                style={{
                  fontSize: numeric && !h.completed ? 13 : 15,
                  fontWeight: '700',
                  color: h.completed ? hex(c.done) : numeric ? hex(c.primary) : hex(c.faint),
                }}
              />
            </FlexWidget>
          );
        })
      )}

      {overflow > 0 ? (
        <TextWidget text={`+${overflow}`} style={{ fontSize: 12, color: hex(c.muted), marginTop: 8 }} />
      ) : (
        <FlexWidget style={{ width: 0, height: 0 }} />
      )}
    </FlexWidget>
  );
}
