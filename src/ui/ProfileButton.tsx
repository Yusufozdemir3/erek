// Ekran başlıklarının sağındaki profil ikonu. Dokununca Profil ekranını
// (hesap + bulut senkron — eski Ayarlar içeriği) modal olarak açar.
// Ayarlar sekmesi kaldırıldığı için tüm sekmeler bu ikonu gösterir.

import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { colors } from './theme';

export function ProfileButton() {
  return (
    <Pressable style={styles.btn} onPress={() => router.push('/profile')} hitSlop={8}>
      <Text style={styles.icon}>👤</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 18 },
});
