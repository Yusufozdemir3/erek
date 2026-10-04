// The tasks widget: today's tasks (and ones carried over from earlier days),
// open ones first. Tapping a row checks the task off — or un-checks it again
// while it's still on the list — through the same queue as the habit widgets
// (see widgetQueue.ts). The card itself opens the app.
//
// Same loading rule as TodayWidget.tsx: only in a real build, never from the
// app's screen tree.

import * as React from 'react';
import { FlexWidget, ListWidget, TextWidget } from 'react-native-android-widget';
import { FALLBACK_COLORS, type WidgetSnapshot } from './widgetSnapshot';
import { TASK_ACTION, isStale } from './widgetQueue';
import { hex } from './TodayWidget';

export function TasksWidget({ snapshot }: { snapshot: WidgetSnapshot | null }) {
  const c = snapshot?.colors ?? FALLBACK_COLORS;
  const stale = isStale(snapshot);
  const tasks = stale ? [] : snapshot?.tasks ?? [];
  const open = tasks.filter((t) => !t.completed).length;
  const emptyText = stale ? snapshot?.staleLabel ?? '' : snapshot?.tasksEmptyLabel ?? '';

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
        style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <TextWidget
          text={snapshot?.tasksTitle ?? 'Erek'}
          style={{ fontSize: 16, fontWeight: '700', color: hex(c.text) }}
        />
        {tasks.length > 0 ? (
          <TextWidget
            text={`${tasks.length - open}/${tasks.length}`}
            style={{ fontSize: 13, fontWeight: '600', color: hex(c.primary) }}
          />
        ) : (
          <TextWidget text="" style={{ fontSize: 13, color: hex(c.faint) }} />
        )}
      </FlexWidget>

      {tasks.length === 0 ? (
        <TextWidget text={emptyText} style={{ fontSize: 13, color: hex(c.muted), marginTop: 12 }} />
      ) : (
        // Scrollable: every task is a list item, nothing is cut off.
        <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>
          {tasks.map((t) => (
          <FlexWidget
            key={t.id}
            clickAction={TASK_ACTION}
            clickActionData={{ taskId: t.id }}
            style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', marginTop: 4, paddingVertical: 5 }}
          >
            {/* Priority color dot */}
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
          ))}
        </ListWidget>
      )}
    </FlexWidget>
  );
}
