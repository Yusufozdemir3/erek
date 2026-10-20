// Profile › About and support: app identity and version (no build number: EAS
// raises it remotely, so app.json's value can differ from the installed one), what Erek is, a
// feedback mail draft, a store rating link, and the legal pages.

import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { Feather } from '@expo/vector-icons';
import { PRIVACY_POLICY_URL } from '@/config';
import { useI18n } from '@/i18n/I18nProvider';
import { CONTACT_EMAIL, feedbackMailto } from '@/lib/feedbackMail';
import { LineIcon, type LineIconId } from '@/ui/LineIcon';
import { makeProfileStyles } from '@/ui/profileStyles';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from '@/ui/theme';

const PACKAGE_ID = 'com.erek';
const STORE_APP_URL = `market://details?id=${PACKAGE_ID}`;
const STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${PACKAGE_ID}`;

const HIGHLIGHTS: { icon: LineIconId; title: string; body: string }[] = [
  { icon: 'habit', title: 'about.hl1Title', body: 'about.hl1Body' },
  { icon: 'bell', title: 'about.hl2Title', body: 'about.hl2Body' },
  { icon: 'lock', title: 'about.hl3Title', body: 'about.hl3Body' },
  { icon: 'cloud', title: 'about.hl4Title', body: 'about.hl4Body' },
];

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

  // The Play Store app first; the web page if it isn't there (or the app isn't published yet).
  const rateApp = async () => {
    try {
      await Linking.openURL(STORE_APP_URL);
    } catch {
      Linking.openURL(STORE_WEB_URL).catch(() => {});
    }
  };

  const link = (icon: keyof typeof Feather.glyphMap, label: string, onPress: () => void, external = false) => (
    <Pressable
      style={[styles.card, styles.navRow, local.row]}
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
        <Image source={require('../assets/icon.png')} style={local.icon} accessibilityIgnoresInvertColors />
        <Text style={local.name}>Erek</Text>
        <Text style={local.version}>
          {t('about.version')} {version}
        </Text>
        <Text style={local.tagline}>{t('about.tagline')}</Text>
      </View>

      <Text style={local.section}>{t('about.sectionAbout')}</Text>
      <View style={styles.card}>
        <Text style={local.intro}>{t('about.intro')}</Text>
      </View>

      <Text style={local.section}>{t('about.sectionHighlights')}</Text>
      <View style={styles.card}>
        {HIGHLIGHTS.map((h, i) => (
          <View key={h.title} style={[local.highlight, i > 0 && local.highlightSpaced]}>
            <View style={local.highlightIcon}>
              <LineIcon id={h.icon} size={18} color={colors.primary} />
            </View>
            <View style={local.highlightText}>
              <Text style={local.highlightTitle}>{t(h.title as 'about.hl1Title')}</Text>
              <Text style={local.highlightBody}>{t(h.body as 'about.hl1Body')}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={local.section}>{t('about.sectionSupport')}</Text>
      {link('mail', t('about.feedback'), sendFeedback)}
      {link('star', t('about.rate'), rateApp, true)}
      <Text style={styles.hint}>
        {t('about.feedbackHint')} {t('about.contactHint', { email: CONTACT_EMAIL })}
      </Text>

      <Text style={local.section}>{t('about.sectionLegal')}</Text>
      {link('shield', t('about.privacyPage'), () => router.push('/privacy' as Href))}
      {link('file-text', t('about.policy'), () => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {}), true)}

      <Text style={local.footer}>{t('about.footer', { year: String(new Date().getFullYear()) })}</Text>
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    head: { alignItems: 'center', paddingTop: 8, paddingBottom: 12 },
    icon: { width: 72, height: 72, borderRadius: 18 },
    name: { fontSize: 28, fontWeight: '800', color: c.text, marginTop: 14 },
    version: { fontSize: 13, color: c.muted, marginTop: 4 },
    tagline: { fontSize: 14, lineHeight: 20, color: c.muted, textAlign: 'center', marginTop: 12, paddingHorizontal: 12 },
    section: { fontSize: 13, fontWeight: '700', color: c.muted, marginTop: 24, marginBottom: 10, marginLeft: 4 },
    intro: { fontSize: 14, lineHeight: 21, color: c.text },
    highlight: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    highlightSpaced: { marginTop: 16 },
    highlightIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    highlightText: { flex: 1 },
    highlightTitle: { fontSize: 14, fontWeight: '700', color: c.text },
    highlightBody: { fontSize: 13, lineHeight: 19, color: c.muted, marginTop: 2 },
    row: { marginBottom: 12 },
    linkLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    footer: { fontSize: 12, color: c.faint, textAlign: 'center', marginTop: 28 },
  });
