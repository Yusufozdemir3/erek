// Profil ekranı (modal) — görünüm (tema) + hesap bağlama + bulut senkron durumu.
// Eski "Ayarlar" sekmesinin içeriği; sekme kaldırılınca ekran başlıklarındaki
// 👤 ikonundan açılan modal'a taşındı. Başlığı kök layout'taki native header verir.
// Senkron yapılandırılmamışsa (.env boş) nasıl kurulacağını anlatır.

import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { userRepo } from '@/db';
import {
  currentAuthUser,
  currentUid,
  deleteAccountAndData,
  isSyncConfigured,
  runSync,
  signOutAccount,
  type AuthUser,
  type SyncResult,
} from '@/sync';
import { useAppData } from '@/ui/AppData';
import { useTheme, type ThemeMode } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { LANG_LABELS, SUPPORTED_LANGS } from '@/i18n/translations';
import { ACCENT_ORDER, ACCENT_THEMES, type Colors } from '@/ui/theme';
import { ACCOUNTS_ENABLED } from '@/config';

const THEME_OPTIONS: { mode: ThemeMode; labelKey: string }[] = [
  { mode: 'light', labelKey: 'profile.themeLight' },
  { mode: 'dark', labelKey: 'profile.themeDark' },
  { mode: 'system', labelKey: 'profile.themeSystem' },
];

export default function ProfileScreen() {
  const { colors, scheme, mode, setMode, accent, setAccent } = useTheme();
  const { t, lang, setLang } = useI18n();
  const styles = makeStyles(colors);
  const { user, refreshUser, hideCompleted, setHideCompleted } = useAppData();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // E-posta hesabıyla bağlı mı? (anonim oturum "bağlı" sayılmaz)
  const linked = authUser != null && !authUser.isAnonymous && authUser.email != null;

  useFocusEffect(
    useCallback(() => {
      currentUid().then((uid) => setSignedIn(uid !== null));
      currentAuthUser().then(setAuthUser);
    }, [])
  );

  const doSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutAccount();
      userRepo.downgradeToLocal(user.id);
      refreshUser();
      setAuthUser(null);
      setSignedIn(false);
      setResult(null);
    } catch (e) {
      // Çıkış hatası kritik değil; durum bir sonraki odaklanmada tazelenir.
      console.warn('[Hesap] Çıkış sırasında hata:', e);
    } finally {
      setSigningOut(false);
    }
  };

  // Hesap silme: geri alınamaz — native onay diyaloğu ile iki adımlı.
  // Bulut hesabı + buluttaki tüm veri silinir; CİHAZDAKİ veri kalır ve
  // kullanıcı anonim/yerel moda döner (çıkışla aynı yerel son durum).
  const confirmDeleteAccount = () => {
    Alert.alert(
      t('profile.deleteAccount'),
      t('profile.deleteAccountConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.deletePermanently'), style: 'destructive', onPress: doDeleteAccount },
      ]
    );
  };

  const doDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccountAndData();
      userRepo.downgradeToLocal(user.id);
      refreshUser();
      setAuthUser(null);
      setSignedIn(false);
      setResult(null);
      Alert.alert(t('profile.deletedTitle'), t('profile.deletedBody'));
    } catch (e) {
      Alert.alert(t('profile.deleteFailedTitle'), e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  const doSync = async () => {
    setSyncing(true);
    const r = await runSync(user.id);
    setResult(r);
    setSyncing(false);
    const uid = await currentUid();
    setSignedIn(uid !== null);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Görünüm (tema) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('profile.appearance')}</Text>
        <View style={styles.segRow}>
          {THEME_OPTIONS.map((opt) => {
            const on = mode === opt.mode;
            return (
              <Pressable
                key={opt.mode}
                style={[styles.segBtn, on && styles.segBtnOn]}
                onPress={() => setMode(opt.mode)}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{t(opt.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>{t('profile.systemHint')}</Text>
      </View>

      {/* Vurgu (marka) rengi */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('profile.accentColor')}</Text>
        <View style={styles.accentRow}>
          {ACCENT_ORDER.map((key) => {
            const on = accent === key;
            const swatch = ACCENT_THEMES[key][scheme].primary;
            return (
              <Pressable
                key={key}
                style={styles.accentItem}
                onPress={() => setAccent(key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={t(`profile.accent.${key}`)}
              >
                <View
                  style={[styles.accentSwatch, { backgroundColor: swatch }, on && styles.accentSwatchOn]}
                >
                  {on && <Text style={styles.accentCheck}>✓</Text>}
                </View>
                <Text style={styles.accentLabel}>{t(`profile.accent.${key}`)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Dil */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('profile.language')}</Text>
        <View style={styles.segRow}>
          {SUPPORTED_LANGS.map((l) => {
            const on = lang === l;
            return (
              <Pressable
                key={l}
                style={[styles.segBtn, on && styles.segBtnOn]}
                onPress={() => setLang(l)}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{LANG_LABELS[l]}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Bugün ekranı tercihleri */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('profile.todayScreen')}</Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('today.hideCompleted')}</Text>
          <Switch
            value={hideCompleted}
            onValueChange={setHideCompleted}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.card}
          />
        </View>
        <Text style={styles.hint}>{t('profile.hideCompletedHint')}</Text>
      </View>

      {/* Hesap + Bulut senkron — kapalı test (MVP) sürümünde gizli.
          Parola sıfırlama eklenince ACCOUNTS_ENABLED true yapılacak. */}
      {ACCOUNTS_ENABLED && (
        <>
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('profile.account')}</Text>

        {!isSyncConfigured ? (
          <Text style={styles.muted}>{t('profile.syncNotConfigured')}</Text>
        ) : linked ? (
          <>
            <View style={styles.statusRow}>
              <Text style={styles.muted}>{t('profile.linkedAccount')}</Text>
              <Text style={styles.statusValue}>{authUser!.email}</Text>
            </View>
            <Pressable
              style={[styles.outlineBtn, signingOut && styles.syncBtnDisabled]}
              onPress={doSignOut}
              disabled={signingOut || deleting}
            >
              {signingOut ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.outlineBtnText}>{t('profile.signOut')}</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.dangerBtn, deleting && styles.syncBtnDisabled]}
              onPress={confirmDeleteAccount}
              disabled={deleting || signingOut}
            >
              {deleting ? (
                <ActivityIndicator color={colors.danger} />
              ) : (
                <Text style={styles.dangerBtnText}>{t('profile.deleteAccount')}</Text>
              )}
            </Pressable>
            <Text style={styles.hint}>{t('profile.deleteAccountHint')}</Text>
          </>
        ) : (
          <>
            <Text style={styles.muted}>{t('profile.notLinkedBody')}</Text>
            <Pressable style={styles.syncBtn} onPress={() => router.push('/account')}>
              <Text style={styles.syncBtnText}>{t('profile.linkAccount')}</Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('profile.cloudSync')}</Text>

        {!isSyncConfigured ? (
          <Text style={styles.muted}>{t('profile.syncNotConfiguredBody')}</Text>
        ) : (
          <>
            <View style={styles.statusRow}>
              <Text style={styles.muted}>{t('profile.syncStatus')}</Text>
              <Text style={styles.statusValue}>
                {signedIn
                  ? linked
                    ? t('profile.syncConnectedAccount')
                    : t('profile.syncConnectedAnon')
                  : t('profile.syncNotConnected')}
              </Text>
            </View>

            {result?.status === 'ok' && (
              <Text style={styles.okText}>
                {t('profile.lastSync', { pushed: result.pushed ?? 0, pulled: result.pulled ?? 0 })}
              </Text>
            )}
            {result?.status === 'error' && (
              <Text style={styles.errText}>{t('profile.syncError', { message: result.message ?? '' })}</Text>
            )}
            {result?.status === 'disabled' && (
              <Text style={[styles.muted, { marginTop: 12 }]}>{t('profile.syncDisabled')}</Text>
            )}

            <Pressable
              style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
              onPress={doSync}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.syncBtnText}>{t('profile.syncNow')}</Text>
              )}
            </Pressable>
          </>
        )}
      </View>
        </>
      )}

      <Text style={styles.footnote}>
        {ACCOUNTS_ENABLED ? t('profile.footnoteSynced') : t('profile.footnoteLocal')}
      </Text>
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 48 },
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 12 },
    muted: { fontSize: 14, color: c.muted, lineHeight: 20 },
    hint: { fontSize: 12, color: c.faint, marginTop: 10 },
    code: { fontWeight: '700', color: c.text },
    statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    switchLabel: { fontSize: 14, color: c.text, flex: 1, marginRight: 12 },
    statusValue: { fontSize: 14, fontWeight: '700', color: c.text },
    okText: { fontSize: 13, color: c.done, fontWeight: '600', marginTop: 12 },
    errText: { fontSize: 13, color: c.danger, fontWeight: '600', marginTop: 12 },
    // Tema seçici segmenti.
    segRow: { flexDirection: 'row', gap: 8 },
    segBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    segBtnOn: { backgroundColor: c.primary, borderColor: c.primary },
    segText: { fontSize: 14, fontWeight: '700', color: c.muted },
    segTextOn: { color: c.onAccent },
    // Vurgu rengi seçici — renkli daireler + altında kısa isim.
    accentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    accentItem: { alignItems: 'center', width: 64 },
    accentSwatch: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    accentSwatchOn: { borderWidth: 3, borderColor: c.text },
    accentCheck: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
    accentLabel: { fontSize: 11, fontWeight: '600', color: c.muted, marginTop: 6, textAlign: 'center' },
    syncBtn: {
      backgroundColor: c.primary,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      marginTop: 16,
      minHeight: 50,
    },
    syncBtnDisabled: { opacity: 0.6 },
    syncBtnText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    outlineBtn: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      marginTop: 16,
      minHeight: 50,
    },
    outlineBtnText: { color: c.primary, fontSize: 15, fontWeight: '700' },
    dangerBtn: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.danger,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      marginTop: 10,
      minHeight: 50,
    },
    dangerBtnText: { color: c.danger, fontSize: 15, fontWeight: '700' },
    footnote: { fontSize: 12, color: c.faint, lineHeight: 18, marginTop: 20 },
  });
