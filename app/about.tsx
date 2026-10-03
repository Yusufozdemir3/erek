// "About and support" sub-screen of Profile: version, a feedback mail draft,
// the privacy policy. The header title comes from the root layout.

import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { Feather } from '@expo/vector-icons';
import { PRIVACY_POLICY_URL } from '@/config';
import { useI18n } from '@/i18n/I18nProvider';
import { CONTACT_EMAIL, feedbackMailto } from '@/lib/feedbackMail';
import { makeProfileStyles } from '@/ui/profileStyles';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from '@/ui/theme';

export default function AboutScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeProfileStyles(colors);
  const local = makeStyles(colors);
  const version = Constants.expoConfig?.version ?? '';

  const sendFeedback = async () => {
    const url = feedbackMailto(t('about.feedbackSubject'), t('about.feedbackIntro'), {
      appVersion: version,
      androidVersion: Platform.Version,
      lang,
    });
    try {
      await Linking.openURL(url);
    } catch {
      // No mail app: say where to write instead of failing silently.
      Alert.alert(t('about.feedback'), t('about.noMail', { email: CONTACT_EMAIL }));
    }
  };

  const link = (icon: keyof typeof Feather.glyphMap, label: string, onPress: () => void, external = false) => (
    <Pressable
      style={[styles.card, styles.navRow, { marginTop: 12 }]}
      onPress={onPress}
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={label}
    >
      <View style={local.linkLeft}>
        <Feather name={icon} size={20} color={colors.primary} />
        <Text style={[styles.cardTitle, { marginBottom: 0 }]}>{label}</Text>
      </View>
      <Feather name={external ? 'external-link' : 'chevron-right'} size={18} color={colors.faint} />
    </Pressable>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={local.head}>
        <Text style={local.name}>Erek</Text>
        <Text style={local.version}>
          {t('about.version')} {version}
        </Text>
        <Text style={local.tagline}>{t('about.tagline')}</Text>
      </View>

      {link('mail', t('about.feedback'), sendFeedback)}
      <Text style={styles.hint}>{t('about.feedbackHint')}</Text>
      {link('shield', t('about.privacyPage'), () => router.push('/privacy' as Href))}
      {link('file-text', t('about.policy'), () => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {}), true)}
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    head: { alignItems: 'center', paddingVertical: 12, marginBottom: 8 },
    name: { fontSize: 28, fontWeight: '800', color: c.text },
    version: { fontSize: 13, color: c.muted, marginTop: 4 },
    tagline: { fontSize: 14, lineHeight: 20, color: c.muted, textAlign: 'center', marginTop: 12 },
    linkLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  });
