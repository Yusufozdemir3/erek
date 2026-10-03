// send-nudge — the ONLY place a friend-nudge push is sent from.
//
// 1. The caller's JWT is verified (the gateway does it too: verify_jwt).
// 2. prepare_nudge() (service role; see schema.sql PHASE 5) checks the share,
//    the friendship, the limits, mute/opt-out, and returns the owner's tokens.
// 3. The push goes through Expo's push service with the project's access
//    token ("enhanced push security": a leaked device token alone can't be
//    used to push to that device).
// A muted/opted-out recipient is answered exactly like a delivered nudge.
//
// Secret (Supabase › Edge Function Secrets): EXPO_ACCESS_TOKEN.
// SUPABASE_URL and the service key are provided by the platform.
// Deploy (no Docker needed): npx supabase functions deploy send-nudge --project-ref <ref> --use-api

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildMessages,
  deadTokens,
  outcome,
  parseRequest,
  pickServiceKey,
  type ExpoTicket,
  type PreparedNudge,
} from './logic.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function reply(status: string, httpStatus = 200): Response {
  return new Response(JSON.stringify({ status }), {
    status: httpStatus,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply('bad_request', 405);

  const serviceKey = pickServiceKey(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('SUPABASE_SECRET_KEYS'));
  if (!serviceKey) {
    console.error('send-nudge: no service key in the environment');
    return reply('error', 500);
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authError } = await admin.auth.getUser(jwt);
  const user = auth?.user;
  if (authError || !user || user.is_anonymous) {
    console.error('send-nudge: auth failed', authError?.message ?? 'no user');
    return reply('unauthorized', 401);
  }

  const parsed = parseRequest(await req.json().catch(() => null));
  if (!parsed) return reply('bad_request', 400);

  const { data, error } = await admin.rpc('prepare_nudge', {
    p_sender: user.id,
    p_kind: parsed.kind,
    p_item_id: parsed.itemId,
  });
  if (error || !data) {
    console.error('send-nudge: prepare_nudge failed', error?.code, error?.message);
    return reply('error', 500);
  }
  const prep = data as PreparedNudge;
  if (prep.status === 'muted') return reply('sent');
  if (prep.status !== 'ok') return reply(prep.status);

  const messages = buildMessages(prep, parsed.kind, parsed.itemId);
  let tickets: ExpoTicket[] = [];
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN') ?? ''}`,
      },
      body: JSON.stringify(messages),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      // Expo's error text carries no secrets (e.g. UNAUTHORIZED = wrong/missing EXPO_ACCESS_TOKEN).
      console.error('send-nudge: expo http', res.status, JSON.stringify(body)?.slice(0, 300));
      return reply('error', 502);
    }
    tickets = Array.isArray(body?.data) ? body.data : [];
  } catch (e) {
    console.error('send-nudge: expo fetch threw', String(e));
    return reply('error', 502);
  }
  console.log('send-nudge: expo tickets', JSON.stringify(tickets).slice(0, 400));

  const dead = deadTokens(messages, tickets);
  if (dead.length > 0) await admin.from('push_tokens').delete().in('token', dead);
  return reply(outcome(messages, tickets));
});
