// The one-habit button widgets: "Erek — Evet/Hayır" (a tap completes the habit
// again/undoes it) and "Erek — Sayaç düğmesi" (every tap adds one). Each placed
// widget shows the habit its owner picked on the configuration screen
// (HabitPickScreen.tsx); the choice is stored per widget id (widgetSnapshot.ts).
//
// Same loading rule as TodayWidget.tsx: only in a real build, never from the
// app's screen tree.

import * as React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { FALLBACK_COLORS, type WidgetSnapshot } from './widgetSnapshot';
import { INC_ACTION, TOGGLE_ACTION, habitKind, isStale } from './widgetQueue';
import { amountLabel, hex } from './TodayWidget';

export function HabitButtonWidget({
  snapshot,
  habitId,
  kind,
}: {
  snapshot: WidgetSnapshot | null;
  habitId: string | null;
  kind: 'binary' | 'numeric';
}) {
  const c = snapshot?.colors ?? FALLBACK_COLORS;
  const habit = habitId ? snapshot?.habits.find((h) => h.id === habitId && habitKind(h) === kind) : undefined;
  const picked = habitId ? snapshot?.pickable?.find((h) => h.id === habitId) : undefined;

  // A card that only opens the app: nothing picked yet, a new day, or a habit
  // that isn't scheduled today.
  const note = !habitId || (!habit && !picked)
    ? snapshot?.pickLabel
    : isStale(snapshot)
      ? snapshot?.staleLabel
      : !habit
        ? snapshot?.notTodayLabel
        : null;
  if (note !== null || !habit) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          height: 'match_parent',
          width: 'match_parent',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: hex(c.card),
          borderRadius: 16,
          padding: 8,
        }}
      >
        {picked && (
          <TextWidget
            text={picked.title}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 13, fontWeight: '700', color: hex(c.text) }}
          />
        )}
        <TextWidget
          text={note ?? ''}
          maxLines={2}
          truncate="END"
          style={{ fontSize: 12, color: hex(c.muted), textAlign: 'center', marginTop: picked ? 2 : 0 }}
        />
      </FlexWidget>
    );
  }

  const numeric = kind === 'numeric';
  const done = habit.completed;
  const fill = done ? hex(c.done) : hex(c.card);
  const ink = done ? hex(c.onAccent) : hex(c.text);
  const glyph = numeric ? amountLabel(habit) : done ? '✓' : '○';

  return (
    <FlexWidget
      clickAction={numeric ? INC_ACTION : TOGGLE_ACTION}
      clickActionData={{ habitId: habit.id }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: fill,
        borderRadius: 16,
        padding: 8,
      }}
    >
      <TextWidget
        text={numeric && !done ? `${glyph} ＋` : glyph}
        style={{ fontSize: 22, fontWeight: '700', color: done ? ink : hex(habit.color) }}
      />
      <TextWidget
        text={habit.title}
        maxLines={2}
        truncate="END"
        style={{ fontSize: 12, color: ink, textAlign: 'center', marginTop: 2 }}
      />
    </FlexWidget>
  );
}
