// The widgets' headless task handler (add/update/resize/click). It never
// touches SQLite: it draws from the stored snapshot, and taps go through the
// widgetQueue.ts queue that the app drains. Registered in index.js in real builds only.

import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { readPicks, readSnapshot, setPick, writeSnapshot } from './widgetSnapshot';
import {
  actionFromClick,
  appendPending,
  applyToSnapshot,
  emitWidgetAction,
  serialized,
} from './widgetQueue';
import { ALL_WIDGETS, updateWidgets, widgetFor } from './renderWidgets';

const newActionId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const name = props.widgetInfo.widgetName;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      props.renderWidget(widgetFor(name, await readSnapshot(), props.widgetInfo, await readPicks()));
      break;
    }
    // OPEN_APP taps open the app natively and never get here.
    case 'WIDGET_CLICK': {
      await serialized(async () => {
        const snapshot = await readSnapshot();
        const picks = await readPicks();
        const action = actionFromClick(snapshot, props.clickAction, props.clickActionData, newActionId());
        if (!snapshot || !action) {
          props.renderWidget(widgetFor(name, snapshot, props.widgetInfo, picks));
          return;
        }
        await appendPending(action);
        const next = applyToSnapshot(snapshot, action);
        await writeSnapshot(next);
        props.renderWidget(widgetFor(name, next, props.widgetInfo, picks));
        // The other widgets show the same items — keep them in step.
        await updateWidgets(
          next,
          ALL_WIDGETS.filter((n) => n !== name)
        );
      });
      // If the app is alive in this runtime, it writes the tap to SQLite now.
      emitWidgetAction();
      break;
    }
    case 'WIDGET_DELETED':
      await setPick(props.widgetInfo.widgetId, null);
      break;
    default:
      break;
  }
}
