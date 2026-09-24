// Supabase client (React Native compatible).
// Credentials are read from .env (EXPO_PUBLIC_-prefixed variables get baked
// into the build). The anon key is public-safe; RLS (row-level security)
// protects the data. If not configured, the client is null and sync silently disables itself.

import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Is the URL a valid http(s) address? (validated so a missing/wrong .env
// value doesn't crash the whole app; if invalid, sync silently disables itself)
function isValidHttpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Is sync configured? (.env filled in and the URL valid)
export const isSyncConfigured = isValidHttpUrl(url) && Boolean(anonKey);

export const supabase: SupabaseClient | null = isSyncConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        storage: AsyncStorage,        // persist the session on the device (anonymous account stays)
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,    // no URL in RN
      },
    })
  : null;

// Auto-refresh the token while the app is foregrounded, stop while backgrounded.
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
