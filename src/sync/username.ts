// The user's own display name (profiles.display_name, set through the
// set_username RPC) — what friends see instead of the Google name. A hidden
// 4-digit tag on the server tells identical names apart; the app never shows it.

import { supabase } from './supabase';

export type SetUsernameResult = 'ok' | 'invalid' | 'failed';

// undefined = couldn't find out (offline); null = no name chosen yet.
export async function getMyUsername(uid: string): Promise<string | null | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase.from('profiles').select('display_name').eq('id', uid).maybeSingle();
  if (error) return undefined;
  const name = (data as { display_name?: string | null } | null)?.display_name;
  return name && name.trim() ? name : null;
}

export async function setMyUsername(name: string): Promise<SetUsernameResult> {
  if (!supabase) return 'failed';
  try {
    const { data, error } = await supabase.rpc('set_username', { p_name: name });
    if (error) return 'failed';
    const status = (data as { status?: string } | null)?.status;
    return status === 'ok' ? 'ok' : status === 'invalid' ? 'invalid' : 'failed';
  } catch {
    return 'failed';
  }
}
