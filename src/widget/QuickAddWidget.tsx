// The quick-add widget: one bar that opens the app straight on the new-task
// form (deep link → app/(tabs)/add.tsx). Nothing to read or tick here, so it
// needs no snapshot beyond the colors and the label — and works before the app
// has ever been opened, with the fallback light theme.
//
// Same loading rule as TodayWidget.tsx: only in a real build, never from the
// app's screen tree.

import * as React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { FALLBACK_COLORS, type WidgetSnapshot } from './widgetSnapshot';
import { hex } from './TodayWidget';

export const QUICK_ADD_URI = 'habitapp://add?step=task';

export function QuickAddWidget({ snapshot }: { snapshot: WidgetSnapshot | null }) {
  const c = snapshot?.colors ?? FALLBACK_COLORS;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: QUICK_ADD_URI }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: hex(c.bg),
        borderRadius: 16,
        paddingHorizontal: 14,
      }}
    >
      <FlexWidget
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: hex(c.primary),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <TextWidget text="+" style={{ fontSize: 22, fontWeight: '700', color: hex(c.onAccent) }} />
      </FlexWidget>
      <FlexWidget style={{ flex: 1, marginLeft: 12 }}>
        <TextWidget
          text={snapshot?.quickAddLabel ?? 'Yeni görev ekle'}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 15, fontWeight: '600', color: hex(c.text) }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
