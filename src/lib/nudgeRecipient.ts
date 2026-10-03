// Whose friend nudges this device should show right now: the signed-in
// (non-anonymous) account, or nobody. Set by sync/pushTokens.ts and
// lib/pushRegistration.ts as the session changes; read by the notification
// handler and the tap router (a nudge addressed to anyone else is ignored).
// Kept dependency-free so the notification layer doesn't pull in the
// Supabase client.

let recipientUid: string | null = null;

export function nudgeRecipientUid(): string | null {
  return recipientUid;
}

export function setNudgeRecipientUid(uid: string | null): void {
  recipientUid = uid;
}
