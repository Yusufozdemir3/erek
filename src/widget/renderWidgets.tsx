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
import { LockedWidget } from './LockedWidget';
import { HabitButtonWidget } from './HabitButtonWidget';
import { isWidgetFree } from '@/plus/plusLogic';
import {
  COUNTER_WIDGET_NAME,
  GOALS_WIDGET_NAME,
  HABIT_CHECK_WIDGET_NAME,
  HABIT_COUNT_WIDGET_NAME,
  QUICKADD_WIDGET_NAME,
  TASKS_WIDGET_NAME,
  WIDGET_NAME,
  readPicks,
  type WidgetPicks,
  type WidgetSnapshot,
} from './widgetSnapshot';

// Every widget the app ships (keep in step with app.json's config plugin).
export const ALL_WIDGETS = [
  WIDGET_NAME,
  COUNTER_WIDGET_NAME,
  TASKS_WIDGET_NAME,
  GOALS_WIDGET_NAME,
  QUICKADD_WIDGET_NAME,
  HABIT_CHECK_WIDGET_NAME,
  HABIT_COUNT_WIDGET_NAME,
];

// MIUI/HyperOS reports a widget size ~8% larger than the visible frame (Redmi
// Note 8 Pro), and the bitmap is drawn unscaled from the top-left, so the right
// and bottom edges got cut off. A proportional inset keeps the card inside.
const MIUI_BRANDS = ['xiaomi', 'redmi', 'poco'];

type WidgetSize = { width: number; height: number; widgetId?: number };


function needsMiuiInset(): boolean {
  const c = Platform.constants as { Manufacturer?: string; Brand?: string } | undefined;
  const maker = `${c?.Manufacturer ?? ''} ${c?.Brand ?? ''}`.toLowerCase();
  return MIUI_BRANDS.some((b) => maker.includes(b));
}

function widgetBody(
  name: string,
  snapshot: WidgetSnapshot | null,
  widgetId: number | undefined,
  picks: WidgetPicks
): React.JSX.Element {
  if (snapshot?.locked && !isWidgetFree(name)) return <LockedWidget snapshot={snapshot} name={name} />;
  if (name === COUNTER_WIDGET_NAME) return <CounterWidget snapshot={snapshot} />;
  if (name === TASKS_WIDGET_NAME) return <TasksWidget snapshot={snapshot} />;
  if (name === GOALS_WIDGET_NAME) return <GoalsWidget snapshot={snapshot} />;
  if (name === QUICKADD_WIDGET_NAME) return <QuickAddWidget snapshot={snapshot} />;
  if (name === HABIT_CHECK_WIDGET_NAME || name === HABIT_COUNT_WIDGET_NAME) {
    const habitId = widgetId === undefined ? null : (picks[String(widgetId)] ?? null);
    return (
      <HabitButtonWidget
        snapshot={snapshot}
        habitId={habitId}
        kind={name === HABIT_COUNT_WIDGET_NAME ? 'numeric' : 'binary'}
      />
    );
  }
  return <TodayWidget snapshot={snapshot} />;
}

export function widgetFor(
  name: string,
  snapshot: WidgetSnapshot | null,
  size?: WidgetSize,
  picks: WidgetPicks = {}
): React.JSX.Element {
  const body = widgetBody(name, snapshot, size?.widgetId, picks);
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
  const picks = await readPicks();
  for (const widgetName of names) {
    try {
      await requestWidgetUpdate({
        widgetName,
        renderWidget: (info) => widgetFor(widgetName, snapshot, info, picks),
        widgetNotFound: () => {},
      });
    } catch {
      // one widget failing must not stop the other
    }
  }
}
