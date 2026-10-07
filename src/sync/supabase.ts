// Supabase client. Credentials come from .env (EXPO_PUBLIC_ vars are baked into
// the build); the anon key is public-safe, RLS protects the data. Unconfigured
// → the client is null and sync stays off.

import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// The session sits in AsyncStorage (plain storage) encrypted with an AES key
// kept in SecureStore, whose ~2KB limit a whole session can exceed — the
// pattern from Supabase's Expo guide.
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

// A missing or malformed .env value turns sync off instead of crashing the app.
function isValidHttpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const isSyncConfigured = isValidHttpUrl(url) && Boolean(anonKey);

// Sent with every request: tasks shared WITH the caller are returned only when
// it's present (client_supports_sharing() in schema.sql). Older versions would
// store a friend's task as their own and wedge their sync on the first edit.
// A compatibility gate, not a security one.
export const SHARING_CAPABILITY_HEADER = 'x-erek-sharing';

export const supabase: SupabaseClient | null = isSyncConfigured
  ? createClient(url!, anonKey!, {
      global: { headers: { [SHARING_CAPABILITY_HEADER]: '1' } },
      auth: {
        storage: secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Refresh the token only while the app is in the foreground.
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
