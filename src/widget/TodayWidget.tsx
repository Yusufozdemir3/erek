// The "Today" home-screen widget, drawn with react-native-android-widget's
// components (turned into Android RemoteViews). Data and colors come from the
// snapshot (widgetSnapshot.ts). Rows: today's habits, then today's tasks.
//
// Taps are handled in the background (widgetQueue.ts): a binary habit or a task
// toggles, a numeric habit adds +1. A timer row and everything else open the
// app. A snapshot from an earlier day takes no taps and asks to be refreshed.
//
// Imports the widget library, so it's only loaded in a real build (lazily by
// widgetData and by the headless handler) — never from the app's screens.

import * as React from 'react';
import { FlexWidget, ListWidget, TextWidget } from 'react-native-android-widget';
import { FALLBACK_COLORS, type WidgetHabit, type WidgetSnapshot, type WidgetTask } from './widgetSnapshot';
import { INC_ACTION, TASK_ACTION, TOGGLE_ACTION, habitKind, isStale } from './widgetQueue';

// The library types colors as `#…` template strings.
export const hex = (s: string) => s as `#${string}`;

// "3/8" for a numeric habit (just "3" without a target).
export function amountLabel(h: WidgetHabit): string {
  const amount = h.amount ?? 0;
  return h.target != null && h.target > 0 ? `${amount}/${h.target}` : String(amount);
}

// What tapping a row does: toggle / +1 in the background, or open the app.
function rowClick(h: WidgetHabit): { clickAction: string; clickActionData?: Record<string, unknown> } {
  const kind = habitKind(h);
  if (kind === 'binary') return { clickAction: TOGGLE_ACTION, clickActionData: { habitId: h.id } };
  if (kind === 'numeric') return { clickAction: INC_ACTION, clickActionData: { habitId: h.id } };
  return { clickAction: 'OPEN_APP' };
}

type TodayRow = { kind: 'habit'; habit: WidgetHabit } | { kind: 'task'; task: WidgetTask };

// The header's "x/y" counts habits and tasks; old snapshots without a template
// keep their habits-only label.
export function todaySummary(snapshot: WidgetSnapshot, rows: TodayRow[]): string {
  if (!snapshot.summaryTemplate) return snapshot.summaryLabel;
  const done = rows.filter((r) => (r.kind === 'habit' ? r.habit.completed : r.task.completed)).length;
  return snapshot.summaryTemplate.replace('{done}', String(done)).replace('{total}', String(rows.length));
}

export function TodayWidget({ snapshot }: { snapshot: WidgetSnapshot | null }) {
  const c = snapshot?.colors ?? FALLBACK_COLORS;
  const stale = isStale(snapshot);
  const rows: TodayRow[] = stale
    ? []
    : [
        ...(snapshot?.habits ?? []).map((habit): TodayRow => ({ kind: 'habit', habit })),
        ...(snapshot?.tasks ?? []).map((task): TodayRow => ({ kind: 'task', task })),
      ];
  const emptyText = stale
    ? snapshot?.staleLabel ?? ''
    : snapshot?.todayEmptyLabel ?? snapshot?.emptyLabel ?? '';

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: hex(c.bg),
        borderRadius: 16,
        padding: 14,
      }}
    >
      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <TextWidget
          text={snapshot?.title ?? 'Erek'}
          style={{ fontSize: 16, fontWeight: '700', color: hex(c.text) }}
        />
        {snapshot && !stale && rows.length > 0 ? (
          <TextWidget
            text={todaySummary(snapshot, rows)}
            style={{ fontSize: 13, fontWeight: '600', color: hex(c.primary) }}
          />
        ) : (
          <TextWidget text="" style={{ fontSize: 13, color: hex(c.faint) }} />
        )}
      </FlexWidget>

      {rows.length === 0 ? (
        <TextWidget text={emptyText} style={{ fontSize: 13, color: hex(c.muted), marginTop: 12 }} />
      ) : (
        // Scrolls rather than cutting rows off.
        <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>
          {rows.map((row) => {
          if (row.kind === 'task') {
            const t = row.task;
            return (
              <FlexWidget
                key={`task-${t.id}`}
                clickAction={TASK_ACTION}
                clickActionData={{ taskId: t.id }}
                style={{
                  width: 'match_parent',
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: 4,
                  paddingVertical: 5,
                }}
              >
                <FlexWidget style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: hex(t.color) }} />
                <FlexWidget style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
                  <TextWidget
                    text={t.title}
                    maxLines={1}
                    truncate="END"
                    style={{ fontSize: 14, color: t.completed ? hex(c.faint) : hex(c.text) }}
                  />
                </FlexWidget>
                <TextWidget
                  text={t.completed ? '✓' : '○'}
                  style={{ fontSize: 15, fontWeight: '700', color: t.completed ? hex(c.done) : hex(c.faint) }}
                />
              </FlexWidget>
            );
          }
          const h = row.habit;
          const numeric = habitKind(h) === 'numeric';
          return (
            <FlexWidget
              key={h.id}
              {...rowClick(h)}
              style={{
                width: 'match_parent',
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: 4,
                paddingVertical: 5,
              }}
            >
              <FlexWidget
                style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: hex(h.color) }}
              />
              <FlexWidget style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
                <TextWidget
                  text={h.title}
                  maxLines={1}
                  truncate="END"
                  style={{ fontSize: 14, color: h.completed ? hex(c.faint) : hex(c.text) }}
                />
              </FlexWidget>
              <TextWidget
                text={numeric && !h.completed ? `${amountLabel(h)} ＋` : h.completed ? '✓' : '○'}
                style={{
                  fontSize: numeric && !h.completed ? 13 : 15,
                  fontWeight: '700',
                  color: h.completed ? hex(c.done) : numeric ? hex(c.primary) : hex(c.faint),
                }}
              />
            </FlexWidget>
          );
          })}
        </ListWidget>
      )}
    </FlexWidget>
  );
}
