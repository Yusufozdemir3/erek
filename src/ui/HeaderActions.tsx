// The buttons on the right of every tab's large title: an optional help icon
// that reopens that screen's feature guide, the Notifications bell (signed in
// only; a dot while something is unread) and the profile photo.

import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useI18n } from '@/i18n/I18nProvider';
import { ProfileButton } from '@/ui/ProfileButton';
import { useInbox } from '@/ui/useInbox';
import { useTheme } from '@/ui/ThemeProvider';

function InboxButton() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { signedIn, unread } = useInbox();
  if (!signedIn) return null;
  return (
    <Pressable
      onPress={() => router.push('/inbox' as Href)}
      hitSlop={8}
      style={styles.icon}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? t('inbox.openUnreadA11y', { n: unread }) : t('inbox.openA11y')}
    >
      <Feather name="bell" size={24} color={colors.primary} />
      {unread > 0 && <View style={[styles.dot, { backgroundColor: colors.danger, borderColor: colors.bg }]} />}
    </Pressable>
  );
}

// onHelp: the screen has a feature guide; shows a small help icon that reopens it.
export function HeaderActions({ onHelp }: { onHelp?: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.row}>
      {onHelp && (
        <Pressable
          onPress={onHelp}
          hitSlop={8}
          style={styles.icon}
          accessibilityRole="button"
          accessibilityLabel={t('guide.helpA11y')}
        >
          <Feather name="help-circle" size={26} color={colors.primary} />
        </Pressable>
      )}
      <InboxButton />
      <ProfileButton />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
});
