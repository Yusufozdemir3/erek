// "My data" sub-screen of Profile: take your habits, tasks and goals out as a
// file (export) or bring such a file back, e.g. on a new phone (import). The
// header title comes from the root layout.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { importData, summarize } from '@/db/importData';
import { useI18n } from '@/i18n/I18nProvider';
import { getLastExportDate, setLastExportDate } from '@/lib/exportPrefs';
import { todayDate } from '@/lib/helpers';
import { rescheduleEverything } from '@/lib/notifications';
import { pickExportFile } from '@/lib/pickExport';
import { shareDataExport } from '@/lib/shareExport';
import { useAppData } from '@/ui/AppData';
import { makeProfileStyles } from '@/ui/profileStyles';
import { useTheme } from '@/ui/ThemeProvider';
import { shortDate, type Colors } from '@/ui/theme';

export default function DataScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeProfileStyles(colors);
  const local = makeStyles(colors);
  const { user, notifyDataChanged } = useAppData();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [lastExport, setLastExport] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getLastExportDate().then((d) => alive && setLastExport(d));
      return () => {
        alive = false;
      };
    }, [])
  );

  const exportData = async () => {
    if (busy) return;
    setBusy('export');
    try {
      const r = await shareDataExport(user.id, t('profile.exportTitle'));
      if (r === 'unavailable') Alert.alert(t('profile.export'), t('profile.exportUnavailable'));
      else {
        const today = todayDate();
        await setLastExportDate(today);
        setLastExport(today);
      }
    } catch {
      Alert.alert(t('profile.export'), t('profile.exportFailed'));
    } finally {
      setBusy(null);
    }
  };

  // Pick a file, show what's in it, import only after the person confirms.
  const importFile = async () => {
    if (busy) return;
    setBusy('import');
    try {
      const picked = await pickExportFile();
      if (picked.kind === 'cancelled') return;
      if (!picked.result.ok) {
        Alert.alert(t('profile.import'), t(`profile.importErr.${picked.result.reason}`));
        return;
      }
      const doc = picked.result.doc;
      const n = summarize(doc);
      const go = await new Promise<boolean>((resolve) =>
        Alert.alert(
          t('profile.import'),
          t('profile.importConfirm', { habits: n.habits, tasks: n.tasks, goals: n.goals }),
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
      const added = Object.values(report.imported).reduce((x, y) => x + y, 0);
      Alert.alert(
        t('profile.import'),
        t('profile.importDone', { n: added, existing: report.existing, skipped: report.skipped })
      );
    } catch {
      Alert.alert(t('profile.import'), t('profile.importFailed'));
    } finally {
      setBusy(null);
    }
  };

  const action = (icon: keyof typeof Feather.glyphMap, title: string, hint: string, onPress: () => void, spaced = false) => (
    <Pressable
      style={[styles.card, spaced && { marginTop: 12 }, busy !== null && { opacity: 0.6 }]}
      onPress={onPress}
      disabled={busy !== null}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={local.head}>
        <Feather name={icon} size={20} color={colors.primary} />
        <Text style={[styles.cardTitle, { marginBottom: 0 }]}>{title}</Text>
      </View>
      <Text style={local.hint}>{hint}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {action('download', t('profile.export'), t('data.exportHint'), exportData)}
      {action('upload', t('profile.import'), t('data.importHint'), importFile, true)}
      <Text style={local.last}>
        {lastExport ? t('data.lastExport', { date: shortDate(lastExport, lang) }) : t('data.neverExported')}
      </Text>
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    hint: { fontSize: 13, lineHeight: 19, color: c.muted, marginTop: 8 },
    last: { fontSize: 12, color: c.faint, textAlign: 'center', marginTop: 16 },
  });
