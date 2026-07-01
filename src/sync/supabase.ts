// Supabase istemcisi (React Native uyumlu).
// Kimlik bilgileri .env'den okunur (EXPO_PUBLIC_ önekli değişkenler derlemeye
// gömülür). anon key public-safe'dir; veriyi RLS (row-level security) korur.
// Yapılandırma yoksa istemci null olur ve senkron sessizce devre dışı kalır.

import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// URL geçerli bir http(s) adresi mi? (eksik/yanlış .env değeri tüm uygulamayı
// çökertmesin diye doğruluyoruz; geçersizse senkron sessizce devre dışı kalır)
function isValidHttpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Senkron yapılandırıldı mı? (.env dolduruldu ve URL geçerli mi)
export const isSyncConfigured = isValidHttpUrl(url) && Boolean(anonKey);

export const supabase: SupabaseClient | null = isSyncConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        storage: AsyncStorage,        // oturumu cihazda sakla (anonim hesap kalıcı)
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,    // RN'de URL yok
      },
    })
  : null;

// Uygulama ön plandayken token'ı otomatik tazele, arka planda durdur.
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
