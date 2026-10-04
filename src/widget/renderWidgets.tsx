// Every home-screen widget the app ships, by its native name (app.json). The
// handler renders the one an event is for; widgetData refreshes all of them.
// Loads react-native-android-widget — real builds only (see TodayWidget.tsx).

import * as React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { TodayWidget } from './TodayWidget';
import { CounterWidget } from './CounterWidget';
import { TasksWidget } from './TasksWidget';
import { GoalsWidget } from './GoalsWidget';
import {
  COUNTER_WIDGET_NAME,
  GOALS_WIDGET_NAME,
  TASKS_WIDGET_NAME,
  WIDGET_NAME,
  type WidgetSnapshot,
} from './widgetSnapshot';

// Every widget the app ships (keep in step with app.json's config plugin).
export const ALL_WIDGETS = [WIDGET_NAME, COUNTER_WIDGET_NAME, TASKS_WIDGET_NAME, GOALS_WIDGET_NAME];

export function widgetFor(name: string, snapshot: WidgetSnapshot | null): React.JSX.Element {
  if (name === COUNTER_WIDGET_NAME) return <CounterWidget snapshot={snapshot} />;
  if (name === TASKS_WIDGET_NAME) return <TasksWidget snapshot={snapshot} />;
  if (name === GOALS_WIDGET_NAME) return <GoalsWidget snapshot={snapshot} />;
  return <TodayWidget snapshot={snapshot} />;
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
        renderWidget: () => widgetFor(widgetName, snapshot),
        widgetNotFound: () => {},
      });
    } catch {
      // one widget failing must not stop the other
    }
  }
}
