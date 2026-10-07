// The profile button in the screen headers: the Google account's photo when
// signed in, otherwise (or if it fails to load) the generic glyph.

import { useState } from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppData } from '@/ui/AppData';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from './theme';

export function ProfileButton() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { authUser } = useAppData();
  const styles = makeStyles(colors);
  // Remembers WHICH url failed, so another account's photo is tried again.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const avatarUrl = authUser && !authUser.isAnonymous ? authUser.avatarUrl : null;
  const showAvatar = avatarUrl != null && avatarUrl !== failedUrl;

  return (
    <Pressable
      style={styles.btn}
      onPress={() => router.push('/profile')}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('profile.title')}
    >
      {showAvatar ? (
        <Image
          source={{ uri: avatarUrl }}
          style={styles.avatar}
          onError={() => setFailedUrl(avatarUrl)}
        />
      ) : (
        <Feather name="user" size={19} color={colors.primary} />
      )}
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
      overflow: 'hidden',
    },
    avatar: { width: '100%', height: '100%' },
  });
