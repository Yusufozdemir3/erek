// Alt sekme çubuğu düzeni: Bugün, Görevler, [＋], Alışkanlıklar, Hedefler.
// Ortadaki kare ＋ bir sekme değil — dokununca 45° dönerek ×'e döner ve üç
// seçenek (Görev·Alışkanlık·Hedef) yaylanarak açılır (AddFab); seçilen tür
// doğrudan ekleme formunda (AddSheet) açılır. Ayarlar sekme olmaktan
// çıktı: içeriği /profile ekranında, ekran başlıklarındaki 👤 ikonundan açılır.
// Her sekmenin kendi büyük başlığı olduğu için sekme başlığı (header) gizli.
// İkonlar çizgi (line-art) ikon setinden çiziliyor: Feather (takvim/onay-kutusu/
// hedef) + Ionicons (alev). @expo/vector-icons Expo ile birlikte gelir; ekstra
// bağımlılık yok. Odaktaki sekme primary renkte, diğerleri soluk (faint).

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
  // Kare ＋ butonunun "swing" menüsü (fan) ve seçilince açılan ekleme formu.
  const [fanOpen, setFanOpen] = useState(false);
  const [sheetStep, setSheetStep] = useState<Step | null>(null);
  // Aynı butona UZUN BASINCA açılan bağımsız sayaç seçici (bkz. TimerPicker) —
  // kısa dokunuşun Görev·Alışkanlık·Hedef menüsüyle çakışmaması için ayrı state.
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

      {/* Kare ＋ dokununca yaylanarak açılan üç seçenek (Görev·Alışkanlık·Hedef).
          Seçilen tür doğrudan ilgili AddSheet formunda açılır. */}
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

      {/* Yalnız bir zamanlayıcı çalışırken görünür — bkz. TimerStrip. */}
      <TimerStrip />
    </>
  );
}
