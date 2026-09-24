// Supabase client (React Native compatible).
// Credentials are read from .env (EXPO_PUBLIC_-prefixed variables get baked
// into the build). The anon key is public-safe; RLS (row-level security)
// protects the data. If not configured, the client is null and sync silently disables itself.

import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// AsyncStorage is plain, unencrypted storage - a session token stored there
// could be read by anyone with device/file access. SecureStore (Keychain on
// iOS, Keystore-backed on Android) is encrypted but has a ~2KB size limit
// that a Supabase session (access + refresh token + user JSON) can exceed.
// This adapter combines both: the actual session blob lives in AsyncStorage,
// encrypted with an AES key that itself is stored in SecureStore. Recommended
// pattern from Supabase's own Expo guide.
class LargeSecureStore {
  private async encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(32));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async decrypt(key: string, value: string): Promise<string | null> {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    return this.decrypt(key, encrypted);
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }
}

const secureSessionStorage = new LargeSecureStore();

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
        storage: secureSessionStorage, // encrypted session persistence (see LargeSecureStore above)
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
