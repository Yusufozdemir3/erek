// A Plus widget on a phone without Plus: a small card that says so and opens the
// Plus screen. Drawn from the snapshot only (headless-safe).
//
// Same loading rule as TodayWidget.tsx: only in a real build, never from the
// app's screen tree.

import * as React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { COUNTER_WIDGET_NAME, FALLBACK_COLORS, GOALS_WIDGET_NAME, TASKS_WIDGET_NAME, type WidgetSnapshot } from './widgetSnapshot';
import { hex } from './TodayWidget';

const PLUS_URI = 'habitapp://plus';

function titleFor(name: string, s: WidgetSnapshot | null): string {
  if (name === COUNTER_WIDGET_NAME) return s?.counterTitle ?? 'Erek';
  if (name === TASKS_WIDGET_NAME) return s?.tasksTitle ?? 'Erek';
  if (name === GOALS_WIDGET_NAME) return s?.goalsTitle ?? 'Erek';
  return 'Erek';
}

export function LockedWidget({ snapshot, name }: { snapshot: WidgetSnapshot | null; name: string }) {
  const c = snapshot?.colors ?? FALLBACK_COLORS;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: PLUS_URI }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        backgroundColor: hex(c.bg),
        borderRadius: 16,
        padding: 14,
      }}
    >
      <TextWidget text={titleFor(name, snapshot)} style={{ fontSize: 16, fontWeight: '700', color: hex(c.text) }} />
      <TextWidget
        text={snapshot?.lockedLabel ?? ''}
        style={{ fontSize: 13, color: hex(c.primary), marginTop: 8 }}
      />
    </FlexWidget>
  );
}
