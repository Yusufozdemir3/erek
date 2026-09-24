// Bottom tab bar layout: Today, Tasks, [＋], Habits, Goals.
// The square ＋ in the middle isn't a tab — tapping it rotates 45° into an ×
// and springs open three options (Task·Habit·Goal) (AddFab); the chosen type
// opens straight into the add form (AddSheet). Settings stopped being a tab:
// its content lives on the /profile screen, opened from the 👤 icon in screen
// headers. Every tab has its own large title, so the tab bar's own header is hidden.
// Icons are drawn from a line-art icon set: Feather (calendar/checkbox/target)
// + Ionicons (flame). @expo/vector-icons ships with Expo, so no extra
// dependency. The focused tab is primary-colored, the rest are faint.

import { useState } from 'react';
import { Tabs } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { AddFab, AddFabButton } from '@/ui/AddFab';
import { AddSheet, type Step } from '@/ui/AddSheet';
import { TimerPicker } from '@/ui/TimerPicker';
import { TimerStrip } from '@/ui/TimerStrip';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useI18n();
  // The square ＋ button's "swing" menu (fan) and the add form it opens once a choice is made.
  const [fanOpen, setFanOpen] = useState(false);
  const [sheetStep, setSheetStep] = useState<Step | null>(null);
  // A separate timer picker (see TimerPicker) opens on a LONG PRESS of the same
  // button — kept as its own state so a short tap's Task·Habit·Goal menu doesn't collide with it.
  const [timerPickerOpen, setTimerPickerOpen] = useState(false);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.faint,
          tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('tabs.today'),
            tabBarIcon: ({ color }) => <Feather name="calendar" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: t('tabs.tasks'),
            tabBarIcon: ({ color }) => <Feather name="check-square" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="add"
          options={{
            title: '',
            tabBarButton: () => (
              <AddFabButton
                open={fanOpen}
                onPress={() => setFanOpen((o) => !o)}
                onLongPress={() => setTimerPickerOpen(true)}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="habits"
          options={{
            title: t('tabs.habits'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'flame' : 'flame-outline'} size={23} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="goals"
          options={{
            title: t('tabs.goals'),
            tabBarIcon: ({ color }) => <Feather name="target" size={22} color={color} />,
          }}
        />
      </Tabs>

      {/* The square ＋ springs open into three options (Task·Habit·Goal) on tap.
          The chosen type opens directly into its AddSheet form. */}
      <AddFab
        open={fanOpen}
        onClose={() => setFanOpen(false)}
        onPick={(step) => {
          setFanOpen(false);
          setSheetStep(step);
        }}
      />

      <AddSheet
        visible={sheetStep !== null}
        initialStep={sheetStep ?? 'menu'}
        onClose={() => setSheetStep(null)}
      />

      <TimerPicker visible={timerPickerOpen} onClose={() => setTimerPickerOpen(false)} />

      {/* Only visible while a timer is running — see TimerStrip. */}
      <TimerStrip />
    </>
  );
}
