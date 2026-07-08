// Hesap bağlama / giriş ekranı (modal). Offline-first korunur: buraya girmek
// zorunlu değil — Ayarlar'dan isteğe bağlı açılır.
//
// Akış:
//   - Kayıt ol / Giriş yap (e-posta + parola, Supabase auth).
//   - Oturum açılınca yerel anonim kullanıcı hesaba YÜKSELTİLİR (email set edilir),
//     tüm yerel veri yeniden gönderilecek şekilde işaretlenir (prepareFullResync)
//     ve tam bir senkron turu çalışır. Böylece bu cihazdaki veri hesaba yedeklenir
//     ve hesabın buluttaki verisi bu cihaza çekilir.
//   - Senkron sonucu (↑gönderilen / ↓alınan) ekranda gösterilir — Supabase
//     etkileşimini görebilmek için.

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { userRepo } from '@/db';
import {
  currentAuthUser,
  isSyncConfigured,
  linkEmailToAnonymous,
  prepareFullResync,
  runSync,
  signInWithEmail,
  signUpWithEmail,
  type SyncResult,
} from '@/sync';
import { useAppData } from '@/ui/AppData';
import { useTheme } from '@/ui/ThemeProvider';
import { type Colors } from '@/ui/theme';

type Mode = 'signin' | 'signup';

// Supabase'in İngilizce hata mesajlarını kullanıcıya Türkçe göster.
function translateAuthError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-posta veya parola hatalı.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Bu e-posta zaten kayıtlı. Giriş yapmayı dene.';
  if (m.includes('email not confirmed'))
    return 'E-posta henüz onaylanmadı. Gelen kutundaki bağlantıya tıkla.';
  if (m.includes('password should be at least')) return 'Parola en az 6 karakter olmalı.';
  if (m.includes('unable to validate email') || m.includes('invalid email'))
    return 'Geçerli bir e-posta gir.';
  if (m.includes('network')) return 'Ağ hatası. İnternet bağlantını kontrol et.';
  return msg;
}

export default function AccountScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { user, refreshUser } = useAppData();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [done, setDone] = useState(false);

  // Oturum açıldıktan sonra: yerel kullanıcıyı hesaba yükselt + tam yeniden senkron.
  const linkAndSync = async () => {
    userRepo.upgradeToAccount(user.id, email.trim());
    await prepareFullResync();
    const r = await runSync(user.id);
    refreshUser();
    setResult(r);
    return r;
  };

  const onSubmit = async () => {
    setError(null);
    setInfo(null);
    setResult(null);
    const em = email.trim();
    if (!em || !password) {
      setError('E-posta ve parola gerekli.');
      return;
    }
    if (password.length < 6) {
      setError('Parola en az 6 karakter olmalı.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        // Şu an anonim oturumdaysak (uygulama açılışta anonim başlar), hesabı
        // updateUser ile DÖNÜŞTÜR: aynı uid korunur → buluttaki verinin sahibi
        // değişmez, RLS çakışması olmaz. Anonim oturum yoksa normal signUp.
        const cur = await currentAuthUser();
        if (cur?.isAnonymous) {
          await linkEmailToAnonymous(em, password);
        } else {
          const { needsConfirmation } = await signUpWithEmail(em, password);
          if (needsConfirmation) {
            setInfo('Hesap oluşturuldu. E-postana gelen onay bağlantısına tıkla, sonra giriş yap.');
            setMode('signin');
            return;
          }
        }
      } else {
        await signInWithEmail(em, password);
      }
      // Buraya geldiysek aktif bir oturum var.
      const r = await linkAndSync();
      if (r.status === 'error') {
        setError(`Giriş başarılı ama senkron başarısız: ${r.message}`);
      } else {
        setInfo('Hesap bağlandı ve veriler senkronlandı.');
        setDone(true);
      }
    } catch (e) {
      setError(translateAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!isSyncConfigured) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>Bulut senkron yapılandırılmadı</Text>
        <Text style={styles.centerBody}>
          Hesap bağlamak için önce .env dosyasına Supabase bilgilerini girip Expo'yu
          yeniden başlatman gerekir.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>
          {mode === 'signin' ? 'Hesabına giriş yap' : 'Yeni hesap oluştur'}
        </Text>
        <Text style={styles.subtitle}>
          Verilerini buluta yedekle ve başka cihazlarla senkronla. Bu cihazdaki
          mevcut verilerin hesabına aktarılır.
        </Text>

        {done ? (
          <View style={styles.card}>
            <Text style={styles.successTitle}>✓ Hesap bağlandı</Text>
            {result?.status === 'ok' && (
              <Text style={styles.syncLine}>
                ↑ {result.pushed} gönderildi · ↓ {result.pulled} alındı
              </Text>
            )}
            <Text style={styles.muted}>{email.trim()} olarak bağlısın.</Text>
            <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
              <Text style={styles.primaryBtnText}>Bitti</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>E-posta</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="ornek@eposta.com"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!busy}
            />

            <Text style={[styles.label, { marginTop: 14 }]}>Parola</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="En az 6 karakter"
              placeholderTextColor={colors.faint}
              secureTextEntry
              autoCapitalize="none"
              editable={!busy}
            />

            {error && <Text style={styles.errText}>{error}</Text>}
            {info && <Text style={styles.infoText}>{info}</Text>}

            <Pressable
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
              onPress={onSubmit}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {mode === 'signin' ? 'Giriş yap' : 'Kayıt ol'}
                </Text>
              )}
            </Pressable>

            <Pressable
              style={styles.switchBtn}
              onPress={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setError(null);
                setInfo(null);
              }}
              disabled={busy}
            >
              <Text style={styles.switchText}>
                {mode === 'signin'
                  ? 'Hesabın yok mu? Kayıt ol'
                  : 'Zaten hesabın var mı? Giriş yap'}
              </Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.footnote}>
          Verilerin önce cihazda saklanır; hesap yalnızca buluta yedekler ve
          değişiklikleri birleştirir (son yazan kazanır).
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    content: { padding: 20, paddingBottom: 48 },
    title: { fontSize: 26, fontWeight: '800', color: c.text, marginTop: 8 },
    subtitle: { fontSize: 14, color: c.muted, lineHeight: 20, marginTop: 6, marginBottom: 20 },
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    label: { fontSize: 13, fontWeight: '700', color: c.text, marginBottom: 6 },
    input: {
      backgroundColor: c.inputBg,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
    },
    primaryBtn: {
      backgroundColor: c.primary,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      marginTop: 18,
      minHeight: 50,
    },
    btnDisabled: { opacity: 0.6 },
    primaryBtnText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    switchBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
    switchText: { color: c.primary, fontSize: 14, fontWeight: '600' },
    errText: { fontSize: 13, color: c.danger, fontWeight: '600', marginTop: 14 },
    infoText: { fontSize: 13, color: c.primary, fontWeight: '600', marginTop: 14 },
    successTitle: { fontSize: 18, fontWeight: '800', color: c.done, marginBottom: 8 },
    syncLine: { fontSize: 14, color: c.text, fontWeight: '600', marginBottom: 8 },
    muted: { fontSize: 14, color: c.muted },
    footnote: { fontSize: 12, color: c.faint, lineHeight: 18, marginTop: 20 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: c.bg },
    centerTitle: { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 8, textAlign: 'center' },
    centerBody: { fontSize: 14, color: c.muted, lineHeight: 20, textAlign: 'center' },
  });
