// Alt sekme çubuğu düzeni. Dört sekme: Bugün, Görevler, Alışkanlıklar, Hedefler.
// Her sekmenin kendi büyük başlığı olduğu için sekme başlığı (header) gizli.
// İkonlar emoji ile çiziliyor (ekstra ikon paketi bağımlılığı yok); seçili
// olmayan sekme soluk gösteriliyor.

import { Tabs } from 'expo-router';
import { Text } from 'react-native';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#4f46e5',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: { borderTopColor: '#e2e8f0' },
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
  );
}
