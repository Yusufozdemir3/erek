// The buttons on the right of every tab's large title: Friends (👥) next to
// the profile photo. The Friends button only exists while signed into a real
// account — sharing needs one, and most people use the app without; for them
// the header stays exactly as it was (just the profile button).

import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ACCOUNTS_ENABLED } from '@/config';
import { useAppData } from '@/ui/AppData';
import { ProfileButton } from '@/ui/ProfileButton';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from './theme';

export function FriendsButton() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  return (
    <Pressable
      style={styles.btn}
      onPress={() => router.push('/friends')}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('friends.title')}
    >
      <Feather name="users" size={18} color={colors.primary} />
    </Pressable>
  );
}

export function HeaderActions() {
  const { authUser } = useAppData();
  const signedIn = ACCOUNTS_ENABLED && authUser != null && !authUser.isAnonymous;
  return (
    <View style={baseStyles.row}>
      {signedIn && <FriendsButton />}
      <ProfileButton />
    </View>
  );
}

const baseStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});

// Same 38px circle as ProfileButton, so the pair reads as one group.
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
  });
