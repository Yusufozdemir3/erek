// Profile: a short menu of sub-screens.

import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { makeProfileStyles } from '@/ui/profileStyles';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { ACCOUNTS_ENABLED } from '@/config';
import { usePlusState } from '@/plus/plusStore';
import { useAppData } from '@/ui/AppData';

// hint: a small line under the label (used by the locked Friends row).
type MenuRow = { icon: keyof typeof Feather.glyphMap; label: string; href: string; hint?: string; highlight?: boolean };

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeProfileStyles(colors);
  const { authUser } = useAppData();
  const plus = usePlusState();
  // Friends/sharing needs a real (non-anonymous) account.
  const signedIn = ACCOUNTS_ENABLED && authUser != null && !authUser.isAnonymous;

  const rows: MenuRow[] = [
    // Only where something can actually be bought.
    ...(plus.billing
      ? [
          {
            icon: 'star',
            label: t('plus.title'),
            href: '/plus',
            hint: plus.plus ? t('plus.menuActive') : t('plus.menuHint'),
            highlight: true,
          } as MenuRow,
        ]
      : []),
    { icon: 'sliders', label: t('profile.appearance'), href: '/appearance' },
    { icon: 'bell', label: t('profile.notifications'), href: '/notifications' },
    // Signed out: a locked row that leads to sign-in, so the feature is discoverable.
    ...(signedIn
      ? [{ icon: 'users', label: t('friends.title'), href: '/friends' } as MenuRow]
      : ACCOUNTS_ENABLED
        ? [{ icon: 'lock', label: t('friends.title'), href: '/account-sync', hint: t('friends.lockedHint') } as MenuRow]
        : []),
    ...(ACCOUNTS_ENABLED
      ? [{ icon: 'user', label: t('profile.accountSync'), href: '/account-sync' } as MenuRow]
      : []),
    { icon: 'shield', label: t('profile.privacy'), href: '/privacy' },
    { icon: 'bar-chart-2', label: t('profile.review'), href: '/review' },
    { icon: 'database', label: t('profile.data'), href: '/data' },
    { icon: 'book-open', label: t('profile.guides'), href: '/guides' },
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
            <Feather name={r.icon} size={20} color={r.hint && !r.highlight ? colors.faint : colors.primary} />
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
