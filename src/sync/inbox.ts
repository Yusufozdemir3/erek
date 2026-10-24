// Notifications inbox, network side: congratulations, finished notices and
// nudges I received in the last 30 days (get_inbox(), supabase/phase11-inbox.sql),
// so they don't vanish with the system notification. Cached under `shared:*`
// (wiped on sign-out by clearSharedData()); online-only otherwise.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseInbox, type InboxItem } from '@/lib/inbox';
import { supabase } from './supabase';
import { SharingError, toSharingError } from './sharingErrors';
import { ensureNicknames, nameFor } from './nicknames';

const LIST_KEY = 'shared:inbox';
const SEEN_KEY = 'shared:inbox:seenAt';

// Nicknames are applied on the way out; the cache keeps the real names.
function withNicknames(items: InboxItem[]): InboxItem[] {
  return items.map((i) => ({ ...i, senderName: nameFor(i.senderId, i.senderName) }));
}

export async function getCachedInbox(): Promise<InboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(LIST_KEY);
    const list = raw ? parseCached(JSON.parse(raw)) : [];
    await ensureNicknames();
    return withNicknames(list);
  } catch {
    return [];
  }
}

// The cache holds InboxItems (already parsed); keep only well-formed ones.
function parseCached(v: unknown): InboxItem[] {
  return Array.isArray(v) ? v.filter((i) => i && typeof i.id === 'string' && typeof i.createdAt === 'string') : [];
}

export async function getInbox(): Promise<InboxItem[]> {
  if (!supabase) throw new SharingError('ERK_AUTH');
  let items: InboxItem[];
  try {
    const { data, error } = await supabase.rpc('get_inbox');
    if (error) throw error;
    items = parseInbox(data);
  } catch (e) {
    throw toSharingError(e);
  }
  await AsyncStorage.setItem(LIST_KEY, JSON.stringify(items)).catch(() => {});
  await ensureNicknames();
  return withNicknames(items);
}

export async function getInboxSeenAt(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export async function setInboxSeenAt(iso: string): Promise<void> {
  await AsyncStorage.setItem(SEEN_KEY, iso).catch(() => {});
}
