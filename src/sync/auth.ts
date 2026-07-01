// Senkron kimliği.
//  - ANONİM: oturum yoksa Supabase'de anonim kullanıcı oluşturulur (ilk açılış).
//  - HESAP: kullanıcı Ayarlar'dan e-posta+parola ile giriş/kayıt yapabilir.
// Dönen uid, buluttaki satırların user_id'si olur (RLS: auth.uid() = user_id).

import { supabase } from './supabase';

// Oturumdaki kullanıcı özeti (UI'da hesap durumunu göstermek için).
export interface AuthUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
}

// Mevcut oturumun uid'sini döner; oturum yoksa anonim giriş yapar.
// Supabase istemcisi yoksa (yapılandırma eksik) null döner.
export async function ensureSignedIn(): Promise<string | null> {
  if (!supabase) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user) return sessionData.session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user?.id ?? null;
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
export async function linkEmailToAnonymous(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Bulut senkron yapılandırılmadı');
  const { error } = await supabase.auth.updateUser({ email, password });
  if (error) throw error;
}

// E-posta + parola ile mevcut hesaba giriş yapar.
export async function signInWithEmail(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Bulut senkron yapılandırılmadı');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// Hesaptan çıkış yapar. Yerel veri cihazda kalır; sonraki senkron yeniden anonim
// oturum açar.
export async function signOutAccount(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
