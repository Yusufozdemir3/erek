// Alt sekme çubuğu düzeni: Bugün, Görevler, [＋], Alışkanlıklar, Hedefler.
// Ortadaki kare ＋ bir sekme değil — dokununca 45° dönerek ×'e döner ve üç
// seçenek (Görev·Alışkanlık·Hedef) yaylanarak açılır (AddFab); seçilen tür
// doğrudan ekleme formunda (AddSheet) açılır. Ayarlar sekme olmaktan
// çıktı: içeriği /profile ekranında, ekran başlıklarındaki 👤 ikonundan açılır.
// Her sekmenin kendi büyük başlığı olduğu için sekme başlığı (header) gizli.
// İkonlar emoji ile çiziliyor (ekstra ikon paketi bağımlılığı yok).

import { useState } from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { AddFab, AddFabButton } from '@/ui/AddFab';
import { AddSheet, type Step } from '@/ui/AddSheet';
import { colors } from '@/ui/theme';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  // Kare ＋ butonunun "swing" menüsü (fan) ve seçilince açılan ekleme formu.
  const [fanOpen, setFanOpen] = useState(false);
  const [sheetStep, setSheetStep] = useState<Step | null>(null);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.faint,
          tabBarStyle: { borderTopColor: colors.border },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Bugün',
            tabBarIcon: ({ focused }) => <TabIcon emoji="📅" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: 'Görevler',
            tabBarIcon: ({ focused }) => <TabIcon emoji="✅" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="add"
          options={{
            title: '',
            tabBarButton: () => (
              <AddFabButton open={fanOpen} onPress={() => setFanOpen((o) => !o)} />
            ),
          }}
        />
        <Tabs.Screen
          name="habits"
          options={{
            title: 'Alışkanlıklar',
            tabBarIcon: ({ focused }) => <TabIcon emoji="🔥" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="goals"
          options={{
            title: 'Hedefler',
            tabBarIcon: ({ focused }) => <TabIcon emoji="🎯" focused={focused} />,
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
    </>
  );
}
