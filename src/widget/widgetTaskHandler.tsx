// The JS widgets' headless task handler (add/update/resize/click). It never
// touches SQLite: it draws from the stored snapshot, and taps go through the
// widgetQueue.ts queue that the app drains. Registered in index.js in real builds only.
//
// The native button widgets show the same habits (nativeWidgets.ts): their
// taps are taken over here before a redraw (they ask for one while the app is
// closed), and a tap here is mirrored on them.

import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { readSnapshot, writeSnapshot, type WidgetSnapshot } from './widgetSnapshot';
import {
  actionFromClick,
  appendPending,
  applyAll,
  applyToSnapshot,
  emitWidgetAction,
  serialized,
  type WidgetAction,
} from './widgetQueue';
import { ALL_WIDGETS, updateWidgets, widgetFor } from './renderWidgets';
import { consumeNativeWidgetActions, patchNativeHabit } from './nativeWidgets';

const newActionId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// The native buttons' unbooked taps: into the JS queue and onto the snapshot.
async function absorbNativeTaps(): Promise<WidgetSnapshot | null> {
  return serialized(async () => {
    const snapshot = await readSnapshot();
    const taps = consumeNativeWidgetActions();
    if (taps.length === 0) return snapshot;
    for (const a of taps) await appendPending(a);
    if (!snapshot) return null;
    const next = applyAll(snapshot, taps);
    await writeSnapshot(next);
    return next;
  });
}

function mirrorToNative(snapshot: WidgetSnapshot, action: WidgetAction): void {
  if (action.kind === 'task') return;
  const h = snapshot.habits.find((x) => x.id === action.habitId);
  if (h) patchNativeHabit(h.id, action.date, h.completed, h.amount ?? 0);
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const name = props.widgetInfo.widgetName;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const snapshot = await absorbNativeTaps();
      props.renderWidget(widgetFor(name, snapshot, props.widgetInfo));
      break;
    }
    // OPEN_APP taps open the app natively and never get here.
    case 'WIDGET_CLICK': {
      await serialized(async () => {
        const snapshot = await readSnapshot();
        const action = actionFromClick(snapshot, props.clickAction, props.clickActionData, newActionId());
        if (!snapshot || !action) {
          props.renderWidget(widgetFor(name, snapshot, props.widgetInfo));
          return;
        }
        await appendPending(action);
        const next = applyToSnapshot(snapshot, action);
        await writeSnapshot(next);
        props.renderWidget(widgetFor(name, next, props.widgetInfo));
        mirrorToNative(next, action);
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
    default:
      break;
  }
}
