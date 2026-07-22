// Profil ekranı (modal) — görünüm (tema) + hesap bağlama + bulut senkron durumu.
// Eski "Ayarlar" sekmesinin içeriği; sekme kaldırılınca ekran başlıklarındaki
// 👤 ikonundan açılan modal'a taşındı. Başlığı kök layout'taki native header verir.
// Senkron yapılandırılmamışsa (.env boş) nasıl kurulacağını anlatır.

import { useCallback, useEffect, useState } from 'react';
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
import { Feather } from '@expo/vector-icons';
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
import { isHapticsEnabled, setHapticsEnabled, tapLight } from '@/lib/haptics';
import { isAiQuickAddEnabled, setAiQuickAddEnabled } from '@/lib/aiPrefs';
import { useAppData } from '@/ui/AppData';
import { useTheme, type ThemeMode } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { LANG_LABELS, SUPPORTED_LANGS } from '@/i18n/translations';
import { ACCENT_ORDER, ACCENT_THEMES, type Colors } from '@/ui/theme';
import { ACCOUNTS_ENABLED, AI_QUICK_ADD_ENABLED } from '@/config';

const THEME_OPTIONS: { mode: ThemeMode; labelKey: string }[] = [
  { mode: 'light', labelKey: 'profile.themeLight' },
  { mode: 'dark', labelKey: 'profile.themeDark' },
  { mode: 'system', labelKey: 'profile.themeSystem' },
];

export default function ProfileScreen() {
  const { colors, scheme, mode, setMode, accent, setAccent, darkStyle, setDarkStyle } = useTheme();
  const { t, lang, setLang } = useI18n();
  const styles = makeStyles(colors);
  const { user, refreshUser, hideCompleted, setHideCompleted } = useAppData();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Titreşim tercihi; cache açılışta yüklendiği için (bkz. _layout) ilk değer doğru.
  const [haptics, setHaptics] = useState(isHapticsEnabled);

  // Titreşimi aç/kapa — kapatınca dokunuşlar anında sessizleşir (cache önce yazılır).
  const toggleHaptics = (value: boolean) => {
    setHaptics(value);
    setHapticsEnabled(value).catch(() => {});
    if (value) tapLight(); // açarken tek örnek titreşim: kullanıcı ne açtığını hisseder
  };

  // AI ile hızlı ekleme — varsayılan KAPALI, AsyncStorage'dan async okunur
  // (haptics'teki gibi senkron cache gerekmez; bu ekran açıldığında bir kere yeter).
  const [aiQuickAdd, setAiQuickAdd] = useState(false);
  useEffect(() => {
    isAiQuickAddEnabled().then(setAiQuickAdd);
  }, []);
  const toggleAiQuickAdd = (value: boolean) => {
    setAiQuickAdd(value);
    setAiQuickAddEnabled(value).catch(() => {});
  };

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
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{t(opt.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>{t('profile.systemHint')}</Text>

        {/* Koyu tema stili — sıcak mürekkep / tam siyah (AMOLED). Işık temada da
            seçilebilir kalır; koyu tema aktifleşince etkisini gösterir. */}
        <Text style={styles.subCardTitle}>{t('profile.darkStyle')}</Text>
        <View style={styles.segRow}>
          {(
            [
              { style: 'warm', labelKey: 'profile.darkWarm' },
              { style: 'black', labelKey: 'profile.darkBlack' },
            ] as { style: 'warm' | 'black'; labelKey: string }[]
          ).map((opt) => {
            const on = darkStyle === opt.style;
            return (
              <Pressable
                key={opt.style}
                style={[styles.segBtn, on && styles.segBtnOn]}
                onPress={() => setDarkStyle(opt.style)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{t(opt.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>
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
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
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

      {/* Titreşim (uygulama içi dokunsal geri bildirim) — bildirim titreşiminden
          AYRI: bu, işaretleme/+−/zamanlayıcı gibi dokunuşlarda hissedilen tepki. */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('profile.haptics')}</Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('profile.hapticsEnabled')}</Text>
          <Switch
            value={haptics}
            onValueChange={toggleHaptics}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.card}
          />
        </View>
        <Text style={styles.hint}>{t('profile.hapticsHint')}</Text>
      </View>

      {/* Yapay zeka — görev eklerken doğal dil ayrıştırma. Özellik şu an tamamen
          KAPALI (bkz. config.AI_QUICK_ADD_ENABLED — güvenlik/maliyet gerekçesi
          orada). Kapalıyken ayarı göstermek anlamsız olurdu: kullanıcı açar ama
          hiçbir şey değişmezdi. Bayrak true olunca kart geri gelir. */}
      {AI_QUICK_ADD_ENABLED && (
        <View style={[styles.card, { marginTop: 16 }]}>
          <Text style={styles.cardTitle}>{t('profile.aiQuickAdd')}</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('profile.aiQuickAddEnabled')}</Text>
            <Switch
              value={aiQuickAdd}
              onValueChange={toggleAiQuickAdd}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.card}
            />
          </View>
          <Text style={styles.hint}>{t('profile.aiQuickAddHint')}</Text>
        </View>
      )}

      {/* Bildirimler — içerik kendi sayfasında (ses/titreşim ayrı denetimlerle
          büyüdü). Ok'lu satıra dokununca açılır. */}
      <Pressable
        style={[styles.card, styles.navRow, { marginTop: 16 }]}
        onPress={() => router.push('/notifications')}
        accessibilityRole="button"
        accessibilityLabel={t('profile.notifications')}
      >
        <Text style={[styles.cardTitle, { marginBottom: 0 }]}>{t('profile.notifications')}</Text>
        <Feather name="chevron-right" size={20} color={colors.faint} />
      </Pressable>

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
              accessibilityRole="button"
              accessibilityLabel={t('profile.signOut')}
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
              accessibilityRole="button"
              accessibilityLabel={t('profile.deleteAccount')}
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
            {/* Giriş artık YALNIZ Google ile (bkz. ui/LoginScreen.tsx). Açılış
                kapısını "Şimdilik geç" ile atlayan kullanıcının giriş yolu burası.
                E-posta+parola ekranı (/account) silinmedi, sadece bağlantısı yok. */}
            <Pressable
              style={styles.syncBtn}
              onPress={() => router.push('/login')}
              accessibilityRole="button"
              accessibilityLabel={t('login.openA11y')}
            >
              <Text style={styles.syncBtnText}>{t('login.google')}</Text>
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
              accessibilityRole="button"
              accessibilityLabel={t('profile.syncNow')}
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
    // Başka sayfaya götüren ok'lu satır (ör. Bildirimler). cardTitle'ın alt
    // boşluğunu satır içinde sıfırlarız ki başlık dikey ortalı dursun.
    navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    // Kart içi ikinci başlık (ör. Görünüm kartındaki "Koyu tema stili").
    subCardTitle: { fontSize: 13, fontWeight: '700', color: c.muted, marginTop: 16, marginBottom: 10 },
    muted: { fontSize: 14, color: c.muted, lineHeight: 20 },
    hint: { fontSize: 12, color: c.faint, marginTop: 10 },
    code: { fontWeight: '700', color: c.text },
    statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    switchRowSpaced: { marginTop: 12 },
    switchLabel: { fontSize: 14, color: c.text, flex: 1, marginRight: 12 },
    rowDisabled: { opacity: 0.4 },
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
