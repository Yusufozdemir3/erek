// Giriş ekranı — YALNIZCA Google ile (kullanıcı kararı). E-posta+parola akışı
// silinmedi, gizli duruyor (bkz. app/account.tsx): ileride gerekirse geri açılır.
//
// Google'ın parolası olmadığı için "şifremi unuttum" sınıfı bir kilitlenme de
// yok — ACCOUNTS_ENABLED'ın kapalı olma gerekçelerinden biri buydu (config.ts).
//
// İKİ YERDE kullanılır, aynı bileşen:
//   - LoginGate: ilk açılışta BİR KEZ tam ekran (OnboardingGate deseni, kendi
//     bayrağını yönetir). "Şimdilik geç" ile atlanabilir — uygulama girişsiz de
//     tam çalışır, offline-first kırılmaz.
//   - app/login.tsx: Profil'den açılan modal rota (atlayan kullanıcı sonradan
//     buradan girer; o yüzden "geç" düğmesi orada gizlenir).

import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { ACCOUNTS_ENABLED } from '@/config';
import { userRepo } from '@/db';
import { cancelAllReminders, rescheduleEverything } from '@/lib/notifications';
import {
  classifySignIn,
  currentAuthUser,
  currentUid,
  GoogleSignInCancelled,
  isGoogleSignInConfigured,
  isSyncConfigured,
  prepareFullResync,
  prepareMergeIntoAccount,
  prepareReplaceWithAccount,
  signInWithGoogle,
  signOutAccount,
} from '@/sync';
import { onOnboardingDone, ONBOARDING_SEEN_KEY } from '@/ui/Onboarding';
import { useAppData } from '@/ui/AppData';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';

const SEEN_KEY = 'login:seen';

export interface LoginScreenProps {
  /** Giriş başarılı ya da kullanıcı geçti — kapatma çağıranın işi. */
  onDone: () => void;
  /** "Şimdilik geç" görünsün mü (açılış kapısında evet, Profil'den açılınca hayır). */
  canSkip?: boolean;
}

export function LoginScreen({ onDone, canSkip = false }: LoginScreenProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  // Giriş sonrası ilk tur da AppData'nın syncNow'ından geçer (runSync doğrudan
  // ÇAĞRILMAZ): "son yedek" damgası ve senkron hata durumu tek yerde toplansın.
  const { user, refreshUser, syncNow } = useAppData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kullanıcıya "birleştir mi, değiştir mi" sorar. Söz verilen davranış:
  //   Birleştir -> yereldekiler bu hesaba KOPYALANIR (yeni id'lerle; eski hesabın
  //                buluttaki verisi olduğu gibi kalır),
  //   Değiştir  -> cihazdaki veri SİLİNİR, bu hesabın bulut verisi indirilir.
  const askSwitchStrategy = (): Promise<'merge' | 'replace' | 'cancel'> =>
    new Promise((resolve) => {
      Alert.alert(
        t('sync.switchTitle'),
        t('sync.switchBody'),
        [
          { text: t('common.cancel'), style: 'cancel', onPress: () => resolve('cancel') },
          { text: t('sync.switchMerge'), onPress: () => resolve('merge') },
          { text: t('sync.switchReplace'), style: 'destructive', onPress: () => resolve('replace') },
        ],
        { cancelable: true, onDismiss: () => resolve('cancel') }
      );
    });

  const onGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();

      // HESAP DEĞİŞİMİ KONTROLÜ (çakışma OLUŞMADAN, e-postayı yazmadan ÖNCE —
      // aşağıda kullanıcı vazgeçerse yerel kayıt yanlış hesabın e-postasıyla
      // "hesaplı" görünmemeli). Yerel id'ler hesap değişince değişmediği için,
      // başka bir hesaba gönderilmiş veriyi olduğu gibi push etmek RLS'e takılır
      // ve senkronu kalıcı kilitler — bu yüzden ne yapılacağı ÖNCEDEN sorulur.
      // Bkz. sync/syncEngine.ts (classifySignIn).
      const uid = await currentUid();
      const kind = uid ? await classifySignIn(uid) : 'fresh';
      let switched = false;
      if (kind === 'switch') {
        const choice = await askSwitchStrategy();
        if (choice === 'cancel') {
          // signInWithGoogle() Supabase oturumunu ÇOKTAN yeni hesaba geçirdi;
          // vazgeçildiğinde geri almazsak açılıştaki sessiz senkron bu hesapla
          // dener, eski hesabın satırlarını RLS reddeder ve senkron kalıcı
          // kilitlenir — kullanıcı hiçbir şey görmeden (sahada görülmüş sınıf,
          // bkz. syncEngine.ts OWNER_UID_KEY notu).
          await signOutAccount().catch((e) =>
            console.warn('[Giriş] iptal sonrası oturum kapatılamadı:', e)
          );
          return;
        }
        if (choice === 'merge') await prepareMergeIntoAccount();
        else await prepareReplaceWithAccount();
        switched = true;
      } else if (kind === 'fresh') {
        // Bu cihazın verisi hiçbir hesaba gönderilmemiş (ya da bağlı olduğu hesap
        // silinmiş — deleteAccountAndData sahiplik damgasını temizler). Satırlar
        // synced=1 kalmış olabileceğinden hepsi yeniden gönderilmeyi beklemeli.
        await prepareFullResync();
      }
      // kind === 'same': HAZIRLIK GEREKMEZ. Veri zaten bu hesaba ait; bekleyen
      // satırlar zaten synced=0 (her repo yazımı öyle işaretler) ve filigranlar
      // bu hesap için geçerli. Eskiden burada da prepareFullResync çağrılıyordu:
      // yıllardır kullanan birinde bu, her girişte on binlerce satırın yeniden
      // push edilmesi + tüm tabloların baştan çekilmesi demekti — mobil veride
      // ve pilde bedeli olan, hiçbir şey kazandırmayan bir tur.

      // Yerel kullanıcı kaydına e-postayı yaz (hesaplı duruma yükselt) —
      // KARARDAN SONRA (yukarıdaki 'cancel' zaten return etti). account.tsx'teki
      // hesap bağlama akışının aynısı.
      const authUser = await currentAuthUser();
      if (authUser?.email) userRepo.upgradeToAccount(user.id, authUser.email);

      const result = await syncNow();
      if (result.status === 'error') {
        setError(
          result.ownershipConflict ? t('sync.ownershipConflict') : (result.message ?? '')
        );
        return;
      }

      if (switched) {
        // Birleştir yeni id'ler üretti, değiştir tüm satırları silip yeniden
        // indirdi — ikisinde de OS'un bildirim kuyruğunda ESKİ id'lerle kurulu
        // tetikleyiciler yetim kalır (bkz. notifications.ts cancelAllReminders
        // başlığı). Nuke edip güncel DB'den baştan kur.
        await cancelAllReminders();
        await rescheduleEverything(user.id);
      }

      refreshUser();
      onDone();
    } catch (e) {
      // Vazgeçmek hata değil: hesap seçiciyi kapatan kullanıcıya kırmızı yazı
      // göstermek yanlış geri bildirim olurdu.
      if (!(e instanceof GoogleSignInCancelled)) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      {canSkip && (
        <Pressable
          style={styles.skip}
          onPress={onDone}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('login.skip')}
        >
          <Text style={styles.skipText}>{t('login.skip')}</Text>
        </Pressable>
      )}

      <View style={styles.body}>
        <Text style={styles.emoji}>☁️</Text>
        <Text style={styles.title}>{t('login.title')}</Text>
        <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
      </View>

      <View style={styles.footer}>
        {error != null && <Text style={styles.error}>{error}</Text>}

        {/* Yapılandırma eksikse düğme HİÇ çizilmez: her dokunuşta hata veren bir
            düğme göstermektense sebebi yazmak dürüst (yalnız geliştirme derlemesinde
            görülür — yayında .env dolu olur). */}
        {isGoogleSignInConfigured && isSyncConfigured ? (
          <Pressable
            style={[styles.googleBtn, busy && styles.googleBtnBusy]}
            onPress={onGoogle}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('login.google')}
          >
            {busy ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Text style={styles.googleMark}>G</Text>
                <Text style={styles.googleText}>{t('login.google')}</Text>
              </>
            )}
          </Pressable>
        ) : (
          <Text style={styles.unconfigured}>{t('login.unconfigured')}</Text>
        )}

        <Text style={styles.note}>{t('login.localNote')}</Text>
      </View>
    </View>
  );
}

// Kök layout'a konan kapı: bayrağı okur, görülmemişse giriş ekranını BİR KEZ
// tam ekran açar. Hesaplar kapalıyken (ACCOUNTS_ENABLED=false) hiç çizilmez.
//
// TANITIMDAN SONRA: iki kapı da bağımsız birer Modal açıyor ve aralarında hiçbir
// sıralama YOKTU — gerçek ilk açılışta ikisi aynı anda mount olup giriş ekranı
// tanıtımın ÜSTÜNE biniyordu. Sonuç, kullanıcının uygulamanın ne olduğunu
// öğrenmeden "Google ile giriş yap" ekranıyla karşılanmasıydı; üstelik tanıtımın
// son sayfası ("verilerin sende kalır") tam da bu kararın bağlamını veriyor ve
// arkada kalıyordu. Artık tanıtım bayrağı yazılmadan bu kapı hiç çizilmez.
export function LoginGate() {
  const [seen, setSeen] = useState<boolean | null>(null); // null = henüz bilinmiyor
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY).then((v) => setSeen(v === '1'));
  }, []);

  // Tanıtım durumu: bayrak bir kez okunur; bu açılışta tanıtım gösteriliyorsa
  // kapanma anı için abone olunur (bkz. Onboarding.onOnboardingDone).
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY).then((v) => {
      if (!cancelled) setOnboardingDone(v === '1');
    });
    const unsubscribe = onOnboardingDone(() => {
      if (!cancelled) setOnboardingDone(true);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!ACCOUNTS_ENABLED || seen !== false || onboardingDone !== true) return null;
  const done = () => {
    setSeen(true);
    AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
  };
  return (
    <Modal visible animationType="fade" onRequestClose={done}>
      <LoginScreen onDone={done} canSkip />
    </Modal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    skip: { position: 'absolute', top: 56, right: 24, zIndex: 1 },
    skipText: { fontSize: 15, fontWeight: '600', color: c.muted },
    body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
    emoji: { fontSize: 64, marginBottom: 24 },
    title: { fontSize: 26, fontWeight: '800', color: c.text, textAlign: 'center' },
    subtitle: { fontSize: 15, color: c.muted, lineHeight: 23, textAlign: 'center', marginTop: 14 },
    footer: { paddingHorizontal: 24, paddingBottom: 48, gap: 16 },
    error: { fontSize: 13, color: c.danger, textAlign: 'center' },
    googleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      height: 52,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    googleBtnBusy: { opacity: 0.6 },
    googleMark: { fontSize: 20, fontWeight: '800', color: c.primary },
    googleText: { fontSize: 16, fontWeight: '700', color: c.text },
    unconfigured: { fontSize: 13, color: c.faint, textAlign: 'center', lineHeight: 19 },
    note: { fontSize: 12, color: c.faint, textAlign: 'center', lineHeight: 18 },
  });
