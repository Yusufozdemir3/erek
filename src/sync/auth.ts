// Senkron kimliği. TEK KURAL: veri, ANCAK kullanıcı bilerek bir hesaba giriş
// yaptıysa cihazdan çıkar. Giriş yoksa senkron devre dışıdır ve uygulama
// tamamen yereldir.
// Dönen uid, buluttaki satırların user_id'si olur (RLS: auth.uid() = user_id).
//
// ANONİM OTURUM ARTIK AÇILMIYOR (2026-07-30). Eskiden ensureSignedIn oturum
// bulamayınca signInAnonymously çağırırdı. ACCOUNTS_ENABLED kapalıyken bu yol
// hiç çalışmadığı için zararsızdı; bayrak açılınca (bkz. src/config.ts) canlıya
// çıktı ve şu davranışı üretti: kullanıcı giriş ekranını "Şimdilik geç" ile
// atlasa bile açılıştaki runSync (bkz. ui/AppData.tsx) anonim bir bulut hesabı
// açıp TÜM yerel veriyi yüklüyordu. Bu, uygulamanın üç ayrı yerdeki sözüyle
// çelişiyordu:
//   - gizlilik politikası §1 ("Giriş yapmazsanız ... hiçbir veri cihazınızdan çıkmaz")
//   - giriş ekranı ('login.localNote': "verilerin cihazında kalır")
//   - Profil dipnotu ('profile.footnoteLocal')
// Anonim yedeklemenin kullanıcıya bir faydası da yoktu: hesabı olmayan kişi o
// veriyi başka bir cihazda geri getiremez, uygulamayı silince erişemez.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GoogleSignin,
  isCancelledResponse,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';

// Oturumdaki kullanıcı özeti (UI'da hesap durumunu göstermek için).
export interface AuthUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
}

// Senkronun kullanacağı uid'yi döner; YOKSA null (senkron devre dışı kalır).
// Oturum AÇMAZ — yalnızca kullanıcının kendi açtığı hesap oturumunu kullanır
// (bkz. dosya başındaki not).
//
// KALINTI ANONİM OTURUM: bu değişiklikten önceki sürümlerde açılmış anonim
// oturumlar cihazlarda duruyor olabilir. Onları kullanmaya devam etmek aynı
// sessiz yüklemeyi sürdürmek olurdu; bu yüzden bulunduklarında kapatılır ve
// senkron devre dışı kalır. Buluttaki eski anonim veriye DOKUNULMAZ: kullanıcı
// sonradan gerçekten giriş yaparsa, sync:ownerUid damgası sayesinde bu "hesap
// değişimi" olarak sınıflanır ve birleştir/değiştir seçeneği sunulur
// (bkz. syncEngine.classifySignIn) — yani eski veri kaybolmaz, sahipsiz de kalmaz.
export async function ensureSignedIn(): Promise<string | null> {
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u) return null;
  if (!(u.is_anonymous ?? false)) return u.id;

  try {
    await supabase.auth.signOut();
  } catch (e) {
    // Kapatılamazsa (ör. ağ yok) sonraki turda yeniden denenir. Bu arada zaten
    // null dönüyoruz, yani kalıntı oturumla push YAPILMAZ — kalıcı zarar yok.
    console.warn('[Senkron] Kalıntı anonim oturum kapatılamadı:', e);
  }
  return null;
}

// Oturum açık mı? (UI'da durum göstermek için)
export async function currentUid(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

// Oturumdaki kullanıcının özeti; oturum yoksa null. Anonim mi hesaplı mı ayırt
// etmek için is_anonymous ve email döner.
export async function currentAuthUser(): Promise<AuthUser | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u) return null;
  return { id: u.id, email: u.email ?? null, isAnonymous: u.is_anonymous ?? false };
}

// E-posta + parola ile YENİ hesap oluşturur.
// Supabase projesinde "Confirm email" açıksa oturum hemen açılmaz; bu durumda
// needsConfirmation=true döner (kullanıcı e-postadaki linke tıklayıp sonra giriş
// yapmalı). Kapalıysa oturum anında açılır.
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ needsConfirmation: boolean }> {
  if (!supabase) throw new Error('Bulut senkron yapılandırılmadı');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

// Mevcut ANONİM oturumu kalıcı hesaba DÖNÜŞTÜRÜR (aynı uid korunur).
// Kritik: signUp yeni bir uid üretir; o zaman buluttaki anonim veri "başka
// kullanıcının" olur ve upsert RLS'e takılır. updateUser uid'yi koruduğu için
// bulut satırlarının sahibi değişmez → çakışma olmaz, manuel silme gerekmez.
// Not: "Confirm email" açıksa e-posta onay bekler ama parola ve uid anında
// geçerlidir; senkron (uid'ye bağlı) hemen çalışır.
//
// ARTIK YALNIZCA KALINTI oturumlar için anlamlı: uygulama kendiliğinden anonim
// oturum açmadığından (bkz. ensureSignedIn), buraya ancak eski bir sürümden
// kalan anonim oturumu olan kullanıcı düşer. O kullanıcı için hâlâ DOĞRU yol:
// uid korunur, buluttaki verisi yeni hesabına aynen geçer.
export async function linkEmailToAnonymous(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Bulut senkron yapılandırılmadı');
  const { error } = await supabase.auth.updateUser({ email, password });
  if (error) throw error;
}

// — GOOGLE İLE GİRİŞ —
// Yerel Google hesap seçici (native SDK) açılır, dönen ID token Supabase'e
// verilir (signInWithIdToken). Tarayıcı tabanlı OAuth akışına göre tercih
// edilme sebebi: uygulamadan çıkmadan, sistemdeki hesaplarla tek dokunuşta.
//
// YAPILANDIRMA (kod dışı, bkz. app/login ekranındaki not):
//   1. Google Cloud Console'da OAuth istemcileri: "Web" (Supabase'in kullandığı)
//      ve "Android" (paket adı com.erek + imzalama anahtarının SHA-1'i).
//   2. Supabase panelinde Authentication > Providers > Google açılır ve WEB
//      istemcisinin ID/secret'ı girilir.
//   3. .env'e EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = o WEB istemcisinin ID'si.
// KRİTİK: buradaki webClientId ANDROID istemcisi değil WEB istemcisidir —
// Supabase gelen ID token'ın "audience" alanını kendi yapılandırmasıyla
// karşılaştırdığı için Android ID'si verilirse giriş sunucuda reddedilir.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

// Google girişi kullanılabilir mi? (.env dolduruldu mu — UI düğmeyi buna göre
// gizler; yapılandırma yokken düğme göstermek her dokunuşta hata demek olurdu)
export const isGoogleSignInConfigured = Boolean(GOOGLE_WEB_CLIENT_ID);

// configure() süreç ömrü boyunca bir kez yeter; her girişte çağırmak zararsız
// ama gereksiz — bayrakla tek sefere indiriyoruz.
let googleConfigured = false;
function configureGoogleSignIn(): void {
  if (googleConfigured || !GOOGLE_WEB_CLIENT_ID) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  googleConfigured = true;
}

// Kullanıcı hesap seçiciyi kapattığında atılır. Çağıran bunu HATA olarak
// göstermemeli — vazgeçmek hata değil (bkz. LoginScreen).
export class GoogleSignInCancelled extends Error {
  constructor() {
    super('Google girişi iptal edildi');
    this.name = 'GoogleSignInCancelled';
  }
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error('Bulut senkron yapılandırılmadı');
  if (!GOOGLE_WEB_CLIENT_ID) throw new Error('Google girişi yapılandırılmadı');
  configureGoogleSignIn();
  // Play Services eksik/eskiyse kullanıcıya güncelleme diyaloğunu SDK gösterir.
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await GoogleSignin.signIn();
  if (isCancelledResponse(res)) throw new GoogleSignInCancelled();
  const idToken = isSuccessResponse(res) ? res.data.idToken : null;
  if (!idToken) throw new Error('Google kimlik jetonu alınamadı');
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
}

// E-posta + parola ile mevcut hesaba giriş yapar.
export async function signInWithEmail(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Bulut senkron yapılandırılmadı');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// — PAROLA SIFIRLAMA — uygulama İÇİ kod akışı (deep link/web sayfası gerekmez):
// 1) requestPasswordReset(email): Supabase kurtarma e-postası yollar.
//    ÖNEMLİ: e-posta şablonunda 6 haneli kod ({{ .Token }}) görünmeli —
//    Supabase panelinde Authentication > Email Templates > "Reset Password"
//    şablonuna {{ .Token }} eklenir (varsayılan şablon yalnız link içerir).
// 2) resetPasswordWithCode(email, kod, yeniParola): kodu verifyOtp(type:
//    'recovery') ile doğrular (bu, oturum da açar) ve updateUser ile yeni
//    parolayı yazar. Başarılıysa kullanıcı GİRİŞ YAPMIŞ olur.
export async function requestPasswordReset(email: string): Promise<void> {
  if (!supabase) throw new Error('Bulut senkron yapılandırılmadı');
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function resetPasswordWithCode(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  if (!supabase) throw new Error('Bulut senkron yapılandırılmadı');
  const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'recovery' });
  if (error) throw error;
  const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
  if (updErr) throw updErr;
}

// Hesabı ve buluttaki TÜM veriyi KALICI olarak siler (Google Play hesap-silme
// zorunluluğu). Sunucudaki SECURITY DEFINER delete_account() RPC'si çağrılır
// (bkz. supabase/schema.sql): kullanıcının satırlarını ve auth kaydını tek
// işlemde siler. Yerel veri cihazda KALIR; kullanıcıyı anonime düşürmek
// çağıranın işidir.
export async function deleteAccountAndData(): Promise<void> {
  if (!supabase) throw new Error('Bulut senkron yapılandırılmadı');
  const { error } = await supabase.rpc('delete_account');
  if (error) throw error;
  // Bulut hesabı silindi: cihazdaki veri artık HİÇBİR hesaba ait değil. Sahiplik
  // damgası kalırsa sonraki giriş yanlışlıkla "hesap değişimi" sayılır ve
  // kullanıcıya gereksiz yere birleştir/değiştir sorusu sorulurdu.
  await AsyncStorage.removeItem('sync:ownerUid');
  // Sunucuda kullanıcı zaten silindi; yerel oturum kapatma hata verse de
  // (geçersiz token vb.) önemsiz: senkron yalnızca GEÇERLİ bir hesap oturumuyla
  // çalışır, silinmiş kullanıcının jetonuyla yapılan push sunucuda reddedilir.
  try {
    await supabase.auth.signOut();
  } catch {
    // yut — yukarıdaki nota bak
  }
}

// Hesaptan çıkış yapar. Yerel veri cihazda kalır; oturum kapandığı için senkron
// kullanıcı yeniden giriş yapana dek kendiliğinden devre dışı kalır
// (ensureSignedIn oturum açmaz — bkz. dosya başındaki not).
export async function signOutAccount(): Promise<void> {
  if (!supabase) return;
  // Google oturumu da bırakılır: aksi halde bir sonraki girişte hesap seçici
  // hiç açılmadan aynı hesapla sessizce dönülür ve kullanıcı hesap değiştiremez.
  // Hiç Google ile girilmemişse bu çağrı zaten sessizce başarısız olur — yutuyoruz.
  try {
    await GoogleSignin.signOut();
  } catch {
    // yut — yukarıdaki nota bak
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
