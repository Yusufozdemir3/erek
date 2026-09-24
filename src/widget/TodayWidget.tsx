// The VIEW of the home-screen widget. Rendered with
// react-native-android-widget's own components (FlexWidget/TextWidget) — NOT
// RN View/StyleSheet; these components get converted into Android
// RemoteViews. Colors/data come from the snapshot (see widgetSnapshot.ts).
// The whole card has an OPEN_APP click attached: tapping the widget opens the
// app (the default route = the Today tab).
//
// IMPORTANT: this file imports react-native-android-widget; that package's
// barrel must not load when there's no native module, i.e. in Expo Go. That's
// why TodayWidget is only ever loaded in a real build (widgetData's lazy
// require + the headless task handler); it is NEVER imported from the app's normal screen tree.

import * as React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetSnapshot } from './widgetSnapshot';

// The library wants colors as the `#rrggbb` template type; since the palette
// keeps plain strings, we narrow it safely from a single spot.
const hex = (s: string) => s as `#${string}`;

// Max number of rows to show so it fits the widget; anything beyond is summarized as "+N".
const MAX_ROWS = 7;

// The light theme used if the widget is added before the app has ever been opened (no snapshot yet).
const FALLBACK: WidgetSnapshot['colors'] = {
  bg: '#f8fafc',
  card: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  primary: '#2f5d45',
  done: '#10b981',
  border: '#e2e8f0',
  onAccent: '#ffffff',
};

export function TodayWidget({ snapshot }: { snapshot: WidgetSnapshot | null }) {
  const c = snapshot?.colors ?? FALLBACK;
  const habits = snapshot?.habits ?? [];
  const visible = habits.slice(0, MAX_ROWS);
  const overflow = habits.length - visible.length;

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
        {snapshot && snapshot.totalCount > 0 ? (
          <TextWidget
            text={snapshot.summaryLabel}
            style={{ fontSize: 13, fontWeight: '600', color: hex(c.primary) }}
          />
        ) : (
          <TextWidget text="" style={{ fontSize: 13, color: hex(c.faint) }} />
        )}
      </FlexWidget>

      {/* List or empty state */}
      {visible.length === 0 ? (
        <TextWidget
          text={snapshot?.emptyLabel ?? ''}
          style={{ fontSize: 13, color: hex(c.muted), marginTop: 12 }}
        />
      ) : (
        visible.map((h) => (
          <FlexWidget
            key={h.id}
            style={{
              width: 'match_parent',
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 10,
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
            {/* Status mark */}
            <TextWidget
              text={h.completed ? '✓' : '○'}
              style={{
                fontSize: 15,
                fontWeight: '700',
                color: h.completed ? hex(c.done) : hex(c.faint),
              }}
            />
          </FlexWidget>
        ))
      )}

      {overflow > 0 ? (
        <TextWidget text={`+${overflow}`} style={{ fontSize: 12, color: hex(c.muted), marginTop: 8 }} />
      ) : (
        <FlexWidget style={{ width: 0, height: 0 }} />
      )}
    </FlexWidget>
  );
}
