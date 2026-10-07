// The tab bar: Today, Tasks, [＋], Habits, Goals. The ＋ in the middle isn't a
// tab: a tap opens the add menu (AddFab → AddSheet), a long press the timer
// picker. Double-tapping the Tasks tab opens a voice task. Profile (and Friends inside it) opens from the headers. Each tab draws its
// own large title, so the navigator's header is hidden.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { onAddRequest } from '@/lib/addRequest';
import { Feather, Ionicons } from '@expo/vector-icons';
import { AddFab, AddFabButton } from '@/ui/AddFab';
import { AddSheet, type Step } from '@/ui/AddSheet';
import { TimerPicker } from '@/ui/TimerPicker';
import { TimerStrip } from '@/ui/TimerStrip';
import { useTheme } from '@/ui/ThemeProvider';
import { useReduceMotion } from '@/ui/useReduceMotion';
import { makeTabInterpolator, tabTransitionSpec } from '@/ui/tabTransition';
import { useI18n } from '@/i18n/I18nProvider';
import { getVoiceSupport } from '@/lib/voice';
import { speechLocale } from '@/lib/voiceLogic';

// Two taps on the Tasks tab within this time = a voice task.
const DOUBLE_TAP_MS = 350;

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const reduceMotion = useReduceMotion();
  const { width } = useWindowDimensions();
  const tabInterpolator = useMemo(() => makeTabInterpolator(width), [width]);
  const [fanOpen, setFanOpen] = useState(false);
  const [sheetStep, setSheetStep] = useState<Step | null>(null);
  const [sheetVoice, setSheetVoice] = useState(false);
  // Voice entry points exist only where speech recognition does.
  const [voiceOk, setVoiceOk] = useState(false);
  const lastTasksTap = useRef(0);
  // Long press: the timer picker (separate state from the tap menu).
  const [timerPickerOpen, setTimerPickerOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    getVoiceSupport(speechLocale(lang)).then((s) => alive && setVoiceOk(s !== 'unavailable'));
    return () => {
      alive = false;
    };
  }, [lang]);

  const openSheet = (step: Step, voice = false) => {
    setFanOpen(false);
    setSheetVoice(voice);
    setSheetStep(step);
  };

  // The quick-add widget's deep link (habitapp://add?step=task).
  useEffect(() => onAddRequest((step) => openSheet(step)), []);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          // The tab being left slides away, then the new one slides in.
          animation: reduceMotion ? 'none' : 'shift',
          ...(reduceMotion ? {} : { transitionSpec: tabTransitionSpec, sceneStyleInterpolator: tabInterpolator }),
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
          listeners={{
            tabPress: () => {
              const now = Date.now();
              if (voiceOk && now - lastTasksTap.current < DOUBLE_TAP_MS) {
                lastTasksTap.current = 0;
                openSheet('task', true);
              } else {
                lastTasksTap.current = now;
              }
            },
          }}
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

      <AddFab
        open={fanOpen}
        onClose={() => setFanOpen(false)}
        onPick={(step, voice) => openSheet(step, voice)}
        voiceAvailable={voiceOk}
      />

      <AddSheet
        visible={sheetStep !== null}
        initialStep={sheetStep ?? 'menu'}
        autoVoice={sheetVoice}
        onClose={() => setSheetStep(null)}
      />

      <TimerPicker visible={timerPickerOpen} onClose={() => setTimerPickerOpen(false)} />

      <TimerStrip />
    </>
  );
}
