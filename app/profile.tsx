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
import { pickExportFile } from '@/lib/pickExport';
import { rescheduleEverything } from '@/lib/notifications';
import { importData, summarize } from '@/db/importData';

// A row either opens a screen (href) or runs an action (onPress).
type MenuRow = { icon: keyof typeof Feather.glyphMap; label: string; href?: string; onPress?: () => void };

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeProfileStyles(colors);
  const { authUser, user, notifyDataChanged } = useAppData();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
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

  // Pick a file, show what's in it, import only after the person confirms.
  const importFile = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const picked = await pickExportFile();
      if (picked.kind === 'cancelled') return;
      if (!picked.result.ok) {
        Alert.alert(t('profile.import'), t(`profile.importErr.${picked.result.reason}`));
        return;
      }
      const doc = picked.result.doc;
      const n = summarize(doc);
      const body = t('profile.importConfirm', {
        habits: n.habits,
        tasks: n.tasks,
        goals: n.goals,
      });
      const go = await new Promise<boolean>((resolve) =>
        Alert.alert(
          t('profile.import'),
          body,
          [
            { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('profile.importDo'), onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        )
      );
      if (!go) return;
      const report = importData(user.id, doc);
      // Reminders came in as rows only: queue them with the OS, and let every
      // screen (and the widgets) re-read.
      rescheduleEverything(user.id).catch(() => {});
      notifyDataChanged();
      const added = Object.values(report.imported).reduce((a, b) => a + b, 0);
      Alert.alert(
        t('profile.import'),
        t('profile.importDone', { n: added, existing: report.existing, skipped: report.skipped })
      );
    } catch {
      Alert.alert(t('profile.import'), t('profile.importFailed'));
    } finally {
      setImporting(false);
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
    { icon: 'upload', label: t('profile.import'), onPress: importFile },
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
