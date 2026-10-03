// "Privacy and offline" sub-screen of Profile: what is kept where RIGHT NOW,
// and which features need a connection. Every sentence comes from the phone's
// real state (account, mic/notification permission, voice consent) through
// lib/privacySummary.ts — nothing here is a fixed marketing line. The header
// title comes from the root layout's native header.

import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { PRIVACY_POLICY_URL } from '@/config';
import { useI18n } from '@/i18n/I18nProvider';
import { notificationPermission } from '@/lib/notifications';
import { buildSummary, NEEDS_INTERNET, WORKS_OFFLINE, type MicPermission, type Where } from '@/lib/privacySummary';
import { getMicPermission } from '@/lib/voice';
import { getOnlineConsent } from '@/lib/voicePrefs';
import { useAppData } from '@/ui/AppData';
import { makeProfileStyles } from '@/ui/profileStyles';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from '@/ui/theme';

const WHERE_ICON: Record<Where, keyof typeof Feather.glyphMap> = {
  device: 'smartphone',
  account: 'cloud',
  thirdParty: 'globe',
};

export default function PrivacyScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeProfileStyles(colors);
  const local = makeStyles(colors);
  const { authUser } = useAppData();
  const signedIn = !!authUser && !authUser.isAnonymous;
  const [mic, setMic] = useState<MicPermission>('unknown');
  const [consent, setConsent] = useState(false);
  const [notif, setNotif] = useState(false);

  // Re-read on every focus: the user may come back from the phone's settings.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getMicPermission()
        .then((m) => alive && setMic(m))
        .catch(() => alive && setMic('unknown'));
      getOnlineConsent().then((c) => alive && setConsent(c));
      notificationPermission().then((p) => alive && setNotif(p.granted));
      return () => {
        alive = false;
      };
    }, [])
  );

  const rows = buildSummary({
    signedIn,
    email: authUser?.email ?? null,
    mic,
    onlineVoiceConsent: consent,
    notificationsAllowed: notif,
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={local.intro}>{t('privacy.intro')}</Text>

      {rows.map((r, i) => (
        <View key={r.id} style={[styles.card, i > 0 && { marginTop: 12 }]}>
          <View style={local.rowHead}>
            <Text style={[styles.cardTitle, { marginBottom: 0, flex: 1 }]}>{t(`privacy.row.${r.id}.title`)}</Text>
            <View style={[local.where, r.where === 'thirdParty' && local.whereThird]}>
              <Feather name={WHERE_ICON[r.where]} size={12} color={r.where === 'thirdParty' ? colors.muted : colors.primary} />
              <Text style={[local.whereText, r.where === 'thirdParty' && local.whereTextThird]}>
                {t(`privacy.where.${r.where}`)}
              </Text>
            </View>
          </View>
          <Text style={local.rowBody}>{t(`privacy.row.${r.id}.${r.state}`, r.vars)}</Text>
        </View>
      ))}

      <View style={[styles.card, { marginTop: 20 }]}>
        <Text style={styles.cardTitle}>{t('privacy.offline.title')}</Text>
        {WORKS_OFFLINE.map((k) => (
          <View key={k} style={local.listRow}>
            <Feather name="check" size={16} color={colors.done} />
            <Text style={local.listText}>{t(`privacy.offline.${k}`)}</Text>
          </View>
        ))}
        <Text style={[styles.cardTitle, { marginTop: 16 }]}>{t('privacy.online.title')}</Text>
        {NEEDS_INTERNET.map((k) => (
          <View key={k} style={local.listRow}>
            <Feather name="wifi" size={16} color={colors.muted} />
            <Text style={local.listText}>{t(`privacy.online.${k}`)}</Text>
          </View>
        ))}
      </View>

      <Text style={local.promise}>{t('privacy.promise')}</Text>
      <Pressable
        style={local.policyBtn}
        onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
        accessibilityRole="link"
      >
        <Feather name="external-link" size={16} color={colors.primary} />
        <Text style={local.policyText}>{t('privacy.policy')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    intro: { fontSize: 14, lineHeight: 21, color: c.muted, marginBottom: 16 },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    where: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 10,
      backgroundColor: c.primarySoft,
    },
    whereThird: { backgroundColor: c.track },
    whereText: { fontSize: 11, fontWeight: '700', color: c.primary },
    whereTextThird: { color: c.muted },
    rowBody: { fontSize: 14, lineHeight: 21, color: c.text },
    listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 5 },
    listText: { flex: 1, fontSize: 14, lineHeight: 20, color: c.text },
    promise: { fontSize: 13, lineHeight: 19, color: c.muted, textAlign: 'center', marginTop: 20 },
    policyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 12,
      minHeight: 48,
    },
    policyText: { fontSize: 14, fontWeight: '700', color: c.primary },
  });
