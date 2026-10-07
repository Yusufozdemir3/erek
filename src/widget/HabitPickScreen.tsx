// The configuration screen of the one-habit button widgets: pick which habit the
// widget placed on the home screen is about. Registered in index.js (real builds
// only). Plain React Native — it runs in its own activity, outside the app's
// providers — and reads only the snapshot.

import * as React from 'react';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { WidgetConfigurationScreenProps } from 'react-native-android-widget';
import { FALLBACK_COLORS, HABIT_COUNT_WIDGET_NAME, readSnapshot, setPick, type WidgetSnapshot } from './widgetSnapshot';
import { widgetFor } from './renderWidgets';

export function HabitPickScreen({ widgetInfo, renderWidget, setResult }: WidgetConfigurationScreenProps) {
  const [snapshot, setSnapshot] = useState<WidgetSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    readSnapshot().then((s) => {
      setSnapshot(s);
      setLoaded(true);
    });
  }, []);

  const c = snapshot?.colors ?? FALLBACK_COLORS;
  const kind = widgetInfo.widgetName === HABIT_COUNT_WIDGET_NAME ? 'numeric' : 'binary';
  const options = (snapshot?.pickable ?? []).filter((h) => h.kind === kind);

  const choose = async (habitId: string) => {
    await setPick(widgetInfo.widgetId, habitId);
    renderWidget(widgetFor(widgetInfo.widgetName, snapshot, widgetInfo, { [widgetInfo.widgetId]: habitId }));
    setResult('ok');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: 20, paddingTop: 48 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: c.text, marginBottom: 12 }}>
        {snapshot?.pickTitle ?? 'Erek'}
      </Text>
      <ScrollView>
        {loaded && options.length === 0 && (
          <Text style={{ fontSize: 14, color: c.muted }}>{snapshot?.pickEmptyLabel ?? ''}</Text>
        )}
        {options.map((h) => (
          <Pressable
            key={h.id}
            onPress={() => choose(h.id)}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: c.card,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 14,
              marginBottom: 8,
            }}
          >
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: h.color, marginRight: 12 }} />
            <Text style={{ flex: 1, fontSize: 16, color: c.text }}>{h.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable onPress={() => setResult('cancel')} accessibilityRole="button" style={{ padding: 14, alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: c.primary }}>{snapshot?.cancelLabel ?? '×'}</Text>
      </Pressable>
    </View>
  );
}
