// "Ayarlar" sekmesi — hesap bağlama + bulut senkron durumu ve manuel senkron.
// Senkron yapılandırılmamışsa (.env boş) nasıl kurulacağını anlatır.

import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { userRepo } from '@/db';
import {
  currentAuthUser,
  currentUid,
  isSyncConfigured,
  runSync,
  signOutAccount,
  type AuthUser,
  type SyncResult,
} from '@/sync';
import { useAppData } from '@/ui/AppData';
import { colors, shared } from '@/ui/theme';

export default function SettingsScreen() {
  const { user, refreshUser } = useAppData();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);

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

  const doSync = async () => {
    setSyncing(true);
    const r = await runSync(user.id);
    setResult(r);
    setSyncing(false);
    const uid = await currentUid();
    setSignedIn(uid !== null);
  };

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content}>
        <Text style={shared.greeting}>Ayarlar</Text>
        <Text style={shared.subtitle}>Hesap, bulut yedekleme ve senkron</Text>

        <View style={[styles.card, { marginTop: 24 }]}>
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
                disabled={signingOut}
              >
                {signingOut ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.outlineBtnText}>Çıkış yap</Text>
                )}
              </Pressable>
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

              <Pressable
                style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
                onPress={doSync}
                disabled={syncing}
              >
                {syncing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.syncBtnText}>Şimdi senkronla</Text>
                )}
              </Pressable>
            </>
          )}
        </View>

        <Text style={styles.footnote}>
          Veriler önce cihazda saklanır; senkron yalnızca buluta yedekler ve
          değişiklikleri birleştirir (son yazan kazanır).
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  code: { fontWeight: '700', color: colors.text },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusValue: { fontSize: 14, fontWeight: '700', color: colors.text },
  okText: { fontSize: 13, color: colors.done, fontWeight: '600', marginTop: 12 },
  errText: { fontSize: 13, color: '#dc2626', fontWeight: '600', marginTop: 12 },
  syncBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 16,
    minHeight: 50,
  },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  outlineBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 16,
    minHeight: 50,
  },
  outlineBtnText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  footnote: { fontSize: 12, color: colors.faint, lineHeight: 18, marginTop: 20 },
});
