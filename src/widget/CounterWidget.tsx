// The counter widget: today's numeric habits ("8 glasses of water") with a big
// +1 button each, so counting doesn't need the app. Reads the same snapshot as
// the Today widget; a +1 goes through the same queue (see widgetQueue.ts).
// The card itself (outside the buttons) opens the app.
//
// Same loading rule as TodayWidget.tsx: only in a real build, never from the
// app's screen tree.

import * as React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { FALLBACK_COLORS, type WidgetSnapshot } from './widgetSnapshot';
import { INC_ACTION, habitKind, isStale } from './widgetQueue';
import { amountLabel, hex } from './TodayWidget';

const MAX_ROWS = 4;

export function CounterWidget({ snapshot }: { snapshot: WidgetSnapshot | null }) {
  const c = snapshot?.colors ?? FALLBACK_COLORS;
  const stale = isStale(snapshot);
  const counters = stale ? [] : (snapshot?.habits ?? []).filter((h) => habitKind(h) === 'numeric');
  const visible = counters.slice(0, MAX_ROWS);
  const overflow = counters.length - visible.length;
  const emptyText = stale ? snapshot?.staleLabel ?? '' : snapshot?.counterEmptyLabel ?? '';

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
      <TextWidget
        text={snapshot?.counterTitle ?? 'Erek'}
        style={{ fontSize: 16, fontWeight: '700', color: hex(c.text) }}
      />

      {visible.length === 0 ? (
        <TextWidget text={emptyText} style={{ fontSize: 13, color: hex(c.muted), marginTop: 12 }} />
      ) : (
        visible.map((h) => (
          <FlexWidget
            key={h.id}
            style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', marginTop: 8 }}
          >
            <FlexWidget
              style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: hex(h.color) }}
            />
            <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 10, marginRight: 8 }}>
              <TextWidget
                text={h.title}
                maxLines={1}
                truncate="END"
                style={{ fontSize: 14, color: hex(c.text) }}
              />
              <TextWidget
                text={h.unit ? `${amountLabel(h)} ${h.unit}` : amountLabel(h)}
                maxLines={1}
                style={{ fontSize: 12, fontWeight: '600', color: h.completed ? hex(c.done) : hex(c.muted) }}
              />
            </FlexWidget>
            {/* The +1 button — the only part of the row that takes a tap */}
            <FlexWidget
              clickAction={INC_ACTION}
              clickActionData={{ habitId: h.id }}
              style={{
                width: 48,
                height: 36,
                borderRadius: 18,
                backgroundColor: h.completed ? hex(c.done) : hex(c.primary),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TextWidget text="+1" style={{ fontSize: 15, fontWeight: '700', color: hex(c.onAccent) }} />
            </FlexWidget>
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
