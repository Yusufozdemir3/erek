// Guides (modal, opened from the Profile menu): every feature guide in one list,
// so a guide can be read again any time — and so the ones that have no screen of
// their own (Widgets) can be found at all. A small "New" tag marks guides the
// person has not opened yet.

import { ScrollView, StyleSheet, Text } from 'react-native';
import { useI18n } from '@/i18n/I18nProvider';
import { GuideList } from '@/ui/guide/GuideList';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from '@/ui/theme';

export default function GuidesScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>{t('guides.subtitle')}</Text>
      <GuideList />
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 48 },
    subtitle: { fontSize: 14, color: c.muted, marginBottom: 16 },
  });
