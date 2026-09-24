// The widget's background (headless) task handler. Runs when an Android
// widget event fires (added/update/resized); reads the ready-made snapshot
// from AsyncStorage and renders the widget. Does NOT touch SQLite (unreliable
// in a headless context) — the snapshot is produced by the app process (widgetData.refreshWidget).
//
// Registered in index.js ONLY in a real build (when the native module exists).

import * as React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { TodayWidget } from './TodayWidget';
import { readSnapshot } from './widgetSnapshot';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const snapshot = await readSnapshot();
      props.renderWidget(<TodayWidget snapshot={snapshot} />);
      break;
    }
    // WIDGET_CLICK: the root 'OPEN_APP' click opens the app on the native
    // side and never reaches the handler. WIDGET_DELETED: nothing to do.
    default:
      break;
  }
}
