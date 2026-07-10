// Profil ekranı (modal) — görünüm (tema) + hesap bağlama + bulut senkron durumu.
// Eski "Ayarlar" sekmesinin içeriği; sekme kaldırılınca ekran başlıklarındaki
// 👤 ikonundan açılan modal'a taşındı. Başlığı kök layout'taki native header verir.
// Senkron yapılandırılmamışsa (.env boş) nasıl kurulacağını anlatır.

import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { type Colors } from '@/ui/theme';
import { ACCOUNTS_ENABLED } from '@/config';

const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: 'Açık' },
  { mode: 'dark', label: 'Koyu' },
  { mode: 'system', label: 'Sistem' },
];

export default function ProfileScreen() {
  const { colors, mode, setMode } = useTheme();
  const styles = makeStyles(colors);
  const { user, refreshUser } = useAppData();
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
      'Hesabı sil',
      'Bulut hesabın ve buluttaki TÜM verilerin kalıcı olarak silinir; bu işlem geri alınamaz.\n\nCihazındaki veriler silinmez — uygulamayı hesapsız kullanmaya devam edersin.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Kalıcı olarak sil', style: 'destructive', onPress: doDeleteAccount },
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
      Alert.alert('Hesap silindi', 'Bulut hesabın ve buluttaki verilerin silindi. Cihazındaki veriler duruyor.');
    } catch (e) {
      Alert.alert('Silme başarısız', e instanceof Error ? e.message : String(e));
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
        <Text style={styles.cardTitle}>Görünüm</Text>
        <View style={styles.segRow}>
          {THEME_OPTIONS.map((opt) => {
            const on = mode === opt.mode;
            return (
              <Pressable
                key={opt.mode}
                style={[styles.segBtn, on && styles.segBtnOn]}
                onPress={() => setMode(opt.mode)}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>"Sistem" telefonun açık/koyu ayarını izler.</Text>
      </View>

      {/* Hesap + Bulut senkron — kapalı test (MVP) sürümünde gizli.
          Parola sıfırlama eklenince ACCOUNTS_ENABLED true yapılacak. */}
      {ACCOUNTS_ENABLED && (
        <>
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>Hesap</Text>

        {!isSyncConfigured ? (
          <Text style={styles.muted}>
            Hesap bağlamak için önce bulut senkronu yapılandır (aşağıya bak).
          </Text>
        ) : linked ? (
          <>
            <View style={styles.statusRow}>
              <Text style={styles.muted}>Bağlı hesap</Text>
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
                <Text style={styles.outlineBtnText}>Çıkış yap</Text>
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
                <Text style={styles.dangerBtnText}>Hesabı sil</Text>
              )}
            </Pressable>
            <Text style={styles.hint}>
              Hesabı silmek buluttaki tüm verini kalıcı olarak kaldırır; cihazındaki veriler kalır.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.muted}>
              Şu an yerel (anonim) kullanıyorsun. Hesap bağlarsan verilerin buluta
              yedeklenir ve başka cihazlarla senkronlanır.
            </Text>
            <Pressable style={styles.syncBtn} onPress={() => router.push('/account')}>
              <Text style={styles.syncBtnText}>Hesap bağla / Giriş yap</Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>Bulut senkron</Text>

        {!isSyncConfigured ? (
          <>
            <Text style={styles.muted}>
              Senkron henüz yapılandırılmadı. Proje kökündeki{' '}
              <Text style={styles.code}>.env.example</Text> dosyasını{' '}
              <Text style={styles.code}>.env</Text> olarak kopyalayıp Supabase
              bilgilerini girin, ardından Expo'yu{' '}
              <Text style={styles.code}>npx expo start -c</Text> ile yeniden başlatın.
            </Text>
          </>
        ) : (
          <>
            <View style={styles.statusRow}>
              <Text style={styles.muted}>Durum</Text>
              <Text style={styles.statusValue}>
                {signedIn ? (linked ? '✓ Bağlı (hesap)' : '✓ Bağlı (anonim)') : 'Bağlı değil'}
              </Text>
            </View>

            {result?.status === 'ok' && (
              <Text style={styles.okText}>
                Son senkron: ↑{result.pushed} gönderildi · ↓{result.pulled} alındı
              </Text>
            )}
            {result?.status === 'error' && (
              <Text style={styles.errText}>Hata: {result.message}</Text>
            )}
            {result?.status === 'disabled' && (
              <Text style={[styles.muted, { marginTop: 12 }]}>
                Senkron şu an kapalı: oturum yok. Hesap bağlayınca kaldığı yerden sürer.
              </Text>
            )}

            <Pressable
              style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
              onPress={doSync}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.syncBtnText}>Şimdi senkronla</Text>
              )}
            </Pressable>
          </>
        )}
      </View>
        </>
      )}

      <Text style={styles.footnote}>
        {ACCOUNTS_ENABLED
          ? 'Veriler önce cihazda saklanır; senkron yalnızca buluta yedekler ve değişiklikleri birleştirir (son yazan kazanır).'
          : 'Verilerin yalnızca bu cihazda saklanır.'}
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
