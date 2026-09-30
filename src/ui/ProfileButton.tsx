// The profile icon on the right side of screen headers. Tapping it opens the
// Profile screen (account + cloud sync — the former Settings content) as a modal.
// Since the Settings tab was removed, every tab shows this icon.
// Signed into a Google account -> shows that account's profile photo instead
// of the generic 👤 glyph; falls back to the glyph if there's no photo, the
// session is anonymous, or the image fails to load.

import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text } from 'react-native';
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
  // Tracks the URL that failed (not just a boolean) so switching to a
  // different account's photo automatically retries instead of staying stuck on the fallback.
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
        <Text style={styles.icon}>👤</Text>
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
    icon: { fontSize: 18 },
    avatar: { width: '100%', height: '100%' },
  });
