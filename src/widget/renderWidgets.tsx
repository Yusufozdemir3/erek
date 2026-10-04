// Every home-screen widget the app ships, by its native name (app.json). The
// handler renders the one an event is for; widgetData refreshes all of them.
// Loads react-native-android-widget — real builds only (see TodayWidget.tsx).

import * as React from 'react';
import { Platform } from 'react-native';
import { overshootDp } from './widgetInset';
import { FlexWidget, requestWidgetUpdate } from 'react-native-android-widget';
import { TodayWidget } from './TodayWidget';
import { CounterWidget } from './CounterWidget';
import { TasksWidget } from './TasksWidget';
import { GoalsWidget } from './GoalsWidget';
import { QuickAddWidget } from './QuickAddWidget';
import {
  COUNTER_WIDGET_NAME,
  GOALS_WIDGET_NAME,
  QUICKADD_WIDGET_NAME,
  TASKS_WIDGET_NAME,
  WIDGET_NAME,
  type WidgetSnapshot,
} from './widgetSnapshot';

// Every widget the app ships (keep in step with app.json's config plugin).
export const ALL_WIDGETS = [
  WIDGET_NAME,
  COUNTER_WIDGET_NAME,
  TASKS_WIDGET_NAME,
  GOALS_WIDGET_NAME,
  QUICKADD_WIDGET_NAME,
];

// The library draws a widget into a bitmap as big as the size the launcher
// reports, and shows it unscaled from the top-left. MIUI/HyperOS reports a size
// about 8% larger than the visible frame (measured on a Redmi Note 8 Pro: a
// 3-cell widget overshoots by ~16dp, a full-width one by more), so the card's
// right/bottom edge, its rounded corners and anything near it (a "+1" button)
// are cut off. Leaving a proportional strip empty keeps the card inside the
// frame; other launchers report the exact size.
const MIUI_BRANDS = ['xiaomi', 'redmi', 'poco'];

type WidgetSize = { width: number; height: number };


function needsMiuiInset(): boolean {
  const c = Platform.constants as { Manufacturer?: string; Brand?: string } | undefined;
  const maker = `${c?.Manufacturer ?? ''} ${c?.Brand ?? ''}`.toLowerCase();
  return MIUI_BRANDS.some((b) => maker.includes(b));
}

function widgetBody(name: string, snapshot: WidgetSnapshot | null): React.JSX.Element {
  if (name === COUNTER_WIDGET_NAME) return <CounterWidget snapshot={snapshot} />;
  if (name === TASKS_WIDGET_NAME) return <TasksWidget snapshot={snapshot} />;
  if (name === GOALS_WIDGET_NAME) return <GoalsWidget snapshot={snapshot} />;
  if (name === QUICKADD_WIDGET_NAME) return <QuickAddWidget snapshot={snapshot} />;
  return <TodayWidget snapshot={snapshot} />;
}

export function widgetFor(
  name: string,
  snapshot: WidgetSnapshot | null,
  size?: WidgetSize
): React.JSX.Element {
  const body = widgetBody(name, snapshot);
  if (!needsMiuiInset()) return body;
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        paddingRight: overshootDp(size?.width),
        paddingBottom: overshootDp(size?.height),
      }}
    >
      {body}
    </FlexWidget>
  );
}

// Redraws the placed instances of the given widgets (all by default); a widget
// that isn't on the home screen is skipped silently.
export async function updateWidgets(
  snapshot: WidgetSnapshot | null,
  names: string[] = ALL_WIDGETS
): Promise<void> {
  for (const widgetName of names) {
    try {
      await requestWidgetUpdate({
        widgetName,
        renderWidget: (info) => widgetFor(widgetName, snapshot, info),
        widgetNotFound: () => {},
      });
    } catch {
      // one widget failing must not stop the other
    }
  }
}
