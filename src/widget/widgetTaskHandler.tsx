// The widgets' background (headless) task handler. Runs when an Android
// widget event fires (added/update/resized/click); reads the ready-made
// snapshot from AsyncStorage and renders the widget. Does NOT touch SQLite
// (unreliable in a headless context) — the snapshot is produced by the app
// process (widgetData.refreshWidget), and taps go through the queue in
// widgetQueue.ts, which the app drains into SQLite.
//
// Registered in index.js ONLY in a real build (when the native module exists).

import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { readSnapshot, writeSnapshot, COUNTER_WIDGET_NAME, WIDGET_NAME } from './widgetSnapshot';
import {
  actionFromClick,
  appendPending,
  applyToSnapshot,
  emitWidgetAction,
  serialized,
} from './widgetQueue';
import { updateWidgets, widgetFor } from './renderWidgets';

const newActionId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const name = props.widgetInfo.widgetName;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      props.renderWidget(widgetFor(name, await readSnapshot()));
      break;
    }
    // A row/button tap (OPEN_APP taps open the app natively and never get here).
    case 'WIDGET_CLICK': {
      await serialized(async () => {
        const snapshot = await readSnapshot();
        const action = actionFromClick(snapshot, props.clickAction, props.clickActionData, newActionId());
        if (!snapshot || !action) {
          props.renderWidget(widgetFor(name, snapshot));
          return;
        }
        await appendPending(action);
        const next = applyToSnapshot(snapshot, action);
        await writeSnapshot(next);
        props.renderWidget(widgetFor(name, next));
        // The other widget shows the same habit — keep the two in step.
        await updateWidgets(next, [name === COUNTER_WIDGET_NAME ? WIDGET_NAME : COUNTER_WIDGET_NAME]);
      });
      // If the app is alive in this runtime, it writes the tap to SQLite now.
      emitWidgetAction();
      break;
    }
    // WIDGET_DELETED: nothing to do.
    default:
      break;
  }
}
