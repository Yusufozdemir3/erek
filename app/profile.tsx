// Profile screen (modal) — a short menu that leads to the sub-screens:
// Appearance, Notifications, and (when accounts are enabled) Account & sync.
// It used to be one long flat list of cards. The header title comes from the
// root layout's native header.

import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { makeProfileStyles } from '@/ui/profileStyles';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { ACCOUNTS_ENABLED } from '@/config';
import { useAppData } from '@/ui/AppData';
import { shareDataExport } from '@/lib/shareExport';

// A row either opens a screen (href) or runs an action (onPress).
type MenuRow = { icon: keyof typeof Feather.glyphMap; label: string; href?: string; onPress?: () => void };

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeProfileStyles(colors);
  const { authUser, user } = useAppData();
  const [exporting, setExporting] = useState(false);
  // Friends/sharing needs a real (non-anonymous) account.
  const signedIn = ACCOUNTS_ENABLED && authUser != null && !authUser.isAnonymous;

  const exportData = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const r = await shareDataExport(user.id, t('profile.exportTitle'));
      if (r === 'unavailable') Alert.alert(t('profile.export'), t('profile.exportUnavailable'));
    } catch {
      Alert.alert(t('profile.export'), t('profile.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const rows: MenuRow[] = [
    { icon: 'sliders', label: t('profile.appearance'), href: '/appearance' },
    { icon: 'bell', label: t('profile.notifications'), href: '/notifications' },
    ...(signedIn ? [{ icon: 'users', label: t('friends.title'), href: '/friends' } as MenuRow] : []),
    // Hidden in builds where accounts are switched off (see src/config.ts).
    ...(ACCOUNTS_ENABLED
      ? [{ icon: 'user', label: t('profile.accountSync'), href: '/account-sync' } as MenuRow]
      : []),
    { icon: 'shield', label: t('profile.privacy'), href: '/privacy' },
    { icon: 'bar-chart-2', label: t('profile.review'), href: '/review' },
    { icon: 'download', label: t('profile.export'), onPress: exportData },
    { icon: 'compass', label: t('profile.setupWizard'), href: '/setup' },
    { icon: 'info', label: t('profile.about'), href: '/about' },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {rows.map((r, i) => (
        <Pressable
          key={r.label}
          style={[styles.card, styles.navRow, i > 0 && { marginTop: 12 }]}
          onPress={r.onPress ?? (() => router.push(r.href as Href))}
          accessibilityRole="button"
          accessibilityLabel={r.label}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Feather name={r.icon} size={20} color={colors.primary} />
            <Text style={[styles.cardTitle, { marginBottom: 0 }]}>{r.label}</Text>
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
