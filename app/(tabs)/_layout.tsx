// Alt sekme çubuğu düzeni: Bugün, Görevler, [＋], Alışkanlıklar, Hedefler.
// Ortadaki ＋ bir sekme değil — dokununca ekleme menüsü (AddSheet) açılır;
// tüm görev/alışkanlık/hedef ekleme oradan yapılır. Ayarlar sekme olmaktan
// çıktı: içeriği /profile ekranında, ekran başlıklarındaki 👤 ikonundan açılır.
// Her sekmenin kendi büyük başlığı olduğu için sekme başlığı (header) gizli.
// İkonlar emoji ile çiziliyor (ekstra ikon paketi bağımlılığı yok).

import { useState } from 'react';
import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AddSheet } from '@/ui/AddSheet';
import { colors } from '@/ui/theme';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>;
}

// Sekme çubuğunun ortasındaki yuvarlak ＋. Navigasyona karışmaz; yalnızca
// AddSheet'i açar (tabBarButton'ı tamamen değiştirdiğimiz için ekrana gidilmez).
function AddTabButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.addWrap} onPress={onPress} hitSlop={8}>
      <View style={styles.addCircle}>
        <Text style={styles.addPlus}>＋</Text>
      </View>
    </Pressable>
  );
}

export default function TabsLayout() {
  const [addOpen, setAddOpen] = useState(false);

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
            tabBarButton: () => <AddTabButton onPress={() => setAddOpen(true)} />,
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

      <AddSheet visible={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  addWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  addCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // Sekme çubuğunun üstüne taşan, hafif gölgeli belirgin buton.
    marginTop: -18,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  addPlus: { color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '600' },
});
