// Friend nudges, client side: sending goes through the send-nudge Edge
// Function (never straight to a push service), settings through the PHASE 5
// RPCs in supabase/schema.sql. Online-only, like the rest of sharing.

import { nudgeOutcome, type NudgeOutcome } from '@/lib/nudgePayload';
import { supabase } from './supabase';

export async function sendNudge(kind: 'habit' | 'goal', itemId: string): Promise<NudgeOutcome> {
  if (!supabase) return 'failed';
  try {
    const { data, error } = await supabase.functions.invoke('send-nudge', { body: { kind, itemId } });
    if (error) {
      // Non-2xx answers still carry {status} (e.g. 401 unauthorized).
      const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
      return nudgeOutcome(body?.status);
    }
    return nudgeOutcome((data as { status?: unknown } | null)?.status);
  } catch {
    return 'failed';
  }
}

export interface NudgePrefs {
  enabled: boolean;
  muted: string[]; // friend uids
}

export async function getNudgePrefs(): Promise<NudgePrefs | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_nudge_prefs');
  if (error || !data) return null;
  const d = data as { enabled?: unknown; muted?: unknown };
  return {
    enabled: d.enabled !== false,
    muted: Array.isArray(d.muted) ? d.muted.filter((x): x is string => typeof x === 'string') : [],
  };
}

export async function setNudgeMute(friendId: string, muted: boolean): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc('set_nudge_mute', { p_friend: friendId, p_muted: muted });
  return !error;
}

export async function setNudgesEnabled(enabled: boolean): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc('set_nudges_enabled', { p_enabled: enabled });
  return !error;
}
