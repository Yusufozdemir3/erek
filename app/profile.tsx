// Profile screen (modal) — a short menu that leads to the sub-screens:
// Appearance, Notifications, and (when accounts are enabled) Account & sync.
// It used to be one long flat list of cards. The header title comes from the
// root layout's native header.

import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { makeProfileStyles } from '@/ui/profileStyles';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { ACCOUNTS_ENABLED } from '@/config';
import { useAppData } from '@/ui/AppData';

// hint: a small line under the label (used by the locked Friends row).
type MenuRow = { icon: keyof typeof Feather.glyphMap; label: string; href: string; hint?: string };

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeProfileStyles(colors);
  const { authUser } = useAppData();
  // Friends/sharing needs a real (non-anonymous) account.
  const signedIn = ACCOUNTS_ENABLED && authUser != null && !authUser.isAnonymous;

  const rows: MenuRow[] = [
    { icon: 'sliders', label: t('profile.appearance'), href: '/appearance' },
    { icon: 'bell', label: t('profile.notifications'), href: '/notifications' },
    // Signed in: the Friends screen. Signed out (but accounts exist in this
    // build): a locked row, so people learn the feature is there; it leads to
    // the Google sign-in instead.
    ...(signedIn
      ? [{ icon: 'users', label: t('friends.title'), href: '/friends' } as MenuRow]
      : ACCOUNTS_ENABLED
        ? [{ icon: 'lock', label: t('friends.title'), href: '/account-sync', hint: t('friends.lockedHint') } as MenuRow]
        : []),
    // Hidden in builds where accounts are switched off (see src/config.ts).
    ...(ACCOUNTS_ENABLED
      ? [{ icon: 'user', label: t('profile.accountSync'), href: '/account-sync' } as MenuRow]
      : []),
    { icon: 'shield', label: t('profile.privacy'), href: '/privacy' },
    { icon: 'bar-chart-2', label: t('profile.review'), href: '/review' },
    { icon: 'database', label: t('profile.data'), href: '/data' },
    { icon: 'compass', label: t('profile.setupWizard'), href: '/setup' },
    { icon: 'info', label: t('profile.about'), href: '/about' },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {rows.map((r, i) => (
        <Pressable
          key={r.label}
          style={[styles.card, styles.navRow, i > 0 && { marginTop: 12 }]}
          onPress={() => router.push(r.href as Href)}
          accessibilityRole="button"
          accessibilityLabel={r.hint ? `${r.label}. ${r.hint}` : r.label}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <Feather name={r.icon} size={20} color={r.hint ? colors.faint : colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { marginBottom: 0 }]}>{r.label}</Text>
              {r.hint && <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{r.hint}</Text>}
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={colors.faint} />
        </Pressable>
      ))}

      <Text style={styles.footnote}>
        {ACCOUNTS_ENABLED ? t('profile.footnoteSynced') : t('profile.footnoteLocal')}
      </Text>
    </ScrollView>
  );
}
