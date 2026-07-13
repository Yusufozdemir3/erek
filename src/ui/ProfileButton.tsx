// Ekran başlıklarının sağındaki profil ikonu. Dokununca Profil ekranını
// (hesap + bulut senkron — eski Ayarlar içeriği) modal olarak açar.
// Ayarlar sekmesi kaldırıldığı için tüm sekmeler bu ikonu gösterir.

import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from './theme';

export function ProfileButton() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  return (
    <Pressable
      style={styles.btn}
      onPress={() => router.push('/profile')}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('profile.title')}
    >
      <Text style={styles.icon}>👤</Text>
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    btn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    icon: { fontSize: 18 },
  });
