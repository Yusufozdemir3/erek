// Every home-screen widget the app ships, by its native name (app.json). The
// handler renders the one an event is for; widgetData refreshes all of them.
// Loads react-native-android-widget — real builds only (see TodayWidget.tsx).

import * as React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { TodayWidget } from './TodayWidget';
import { CounterWidget } from './CounterWidget';
import { COUNTER_WIDGET_NAME, WIDGET_NAME, type WidgetSnapshot } from './widgetSnapshot';

export function widgetFor(name: string, snapshot: WidgetSnapshot | null): React.JSX.Element {
  return name === COUNTER_WIDGET_NAME ? (
    <CounterWidget snapshot={snapshot} />
  ) : (
    <TodayWidget snapshot={snapshot} />
  );
}

// Redraws the placed instances of the given widgets (all by default); a widget
// that isn't on the home screen is skipped silently.
export async function updateWidgets(
  snapshot: WidgetSnapshot | null,
  names: string[] = [WIDGET_NAME, COUNTER_WIDGET_NAME]
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
