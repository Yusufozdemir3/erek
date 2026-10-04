// The goals widget: open goals with a progress bar each. Tapping a goal opens
// that goal's screen (deep link); anywhere else opens the app. Progress is
// entered in the app, in one place.
//
// The bar is two weighted halves (filled / empty) because widget sizes are in
// dp and the width isn't known; weights split whatever room there is.
//
// Same loading rule as TodayWidget.tsx: only in a real build, never from the
// app's screen tree.

import * as React from 'react';
import { FlexWidget, ListWidget, TextWidget } from 'react-native-android-widget';
import { FALLBACK_COLORS, type WidgetSnapshot } from './widgetSnapshot';
import { isStale } from './widgetQueue';
import { hex } from './TodayWidget';

export function GoalsWidget({ snapshot }: { snapshot: WidgetSnapshot | null }) {
  const c = snapshot?.colors ?? FALLBACK_COLORS;
  const stale = isStale(snapshot);
  const goals = stale ? [] : snapshot?.goals ?? [];
  const emptyText = stale ? snapshot?.staleLabel ?? '' : snapshot?.goalsEmptyLabel ?? '';

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
        text={snapshot?.goalsTitle ?? 'Erek'}
        style={{ fontSize: 16, fontWeight: '700', color: hex(c.text) }}
      />

      {goals.length === 0 ? (
        <TextWidget text={emptyText} style={{ fontSize: 13, color: hex(c.muted), marginTop: 12 }} />
      ) : (
        // Scrollable: every goal is a list item, nothing is cut off.
        <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>
          {goals.map((g) => (
          <FlexWidget
            key={g.id}
            clickAction="OPEN_URI"
            clickActionData={{ uri: `habitapp://goal/${encodeURIComponent(g.id)}` }}
            style={{ width: 'match_parent', flexDirection: 'column', marginTop: 10 }}
          >
            <FlexWidget
              style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <FlexWidget style={{ flex: 1, marginRight: 8 }}>
                <TextWidget
                  text={g.title}
                  maxLines={1}
                  truncate="END"
                  style={{ fontSize: 14, color: hex(c.text) }}
                />
              </FlexWidget>
              <TextWidget text={g.percentLabel} style={{ fontSize: 13, fontWeight: '700', color: hex(c.primary) }} />
            </FlexWidget>
            <FlexWidget
              style={{
                width: 'match_parent',
                height: 6,
                borderRadius: 3,
                marginTop: 5,
                flexDirection: 'row',
                backgroundColor: hex(c.border),
              }}
            >
              {g.percent > 0 ? (
                <FlexWidget
                  style={{ flex: g.percent, height: 6, borderRadius: 3, backgroundColor: hex(g.percent >= 100 ? c.done : c.primary) }}
                />
              ) : (
                <FlexWidget style={{ width: 0, height: 6 }} />
              )}
              {g.percent < 100 ? <FlexWidget style={{ flex: 100 - g.percent, height: 6 }} /> : <FlexWidget style={{ width: 0, height: 6 }} />}
            </FlexWidget>
          </FlexWidget>
          ))}
        </ListWidget>
      )}
    </FlexWidget>
  );
}
