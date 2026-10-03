// What the "Privacy and offline" page tells the user. Pure: the page gathers the
// phone's real state (account, permissions, consent) and this turns it into rows
// with the i18n key to show — so every sentence on that page is a function of
// facts the app can check, not a hard-coded promise. Testable in the Node project.
//
// Each statement here must stay true to the privacy policy
// (docs/privacy-policy.md) and the code: change one, change them together.

import { INTERSTITIAL_MIN_GAP_MS } from './adsLogic';

export type MicPermission = 'granted' | 'ask' | 'blocked' | 'unknown';

export interface PrivacyInputs {
  signedIn: boolean; // a real (non-anonymous) account is signed in on this phone
  email: string | null;
  mic: MicPermission;
  onlineVoiceConsent: boolean; // agreed to the phone's online speech recognition
  notificationsAllowed: boolean; // OS permission
}

export type RowId = 'data' | 'voice' | 'notifications' | 'ads' | 'crash';
// Where the information goes: nowhere, the user's own account, or a service provider.
export type Where = 'device' | 'account' | 'thirdParty';

export interface SummaryRow {
  id: RowId;
  where: Where;
  // i18n key of the sentence: `privacy.row.<id>.<state>`
  state: string;
  vars: Record<string, string | number>;
}

export function buildSummary(i: PrivacyInputs): SummaryRow[] {
  const rows: SummaryRow[] = [];

  rows.push(
    i.signedIn
      ? { id: 'data', where: 'account', state: i.email ? 'cloud' : 'cloudNoEmail', vars: { email: i.email ?? '' } }
      : { id: 'data', where: 'device', state: 'device', vars: {} }
  );

  // The mic only listens after a tap, and nothing is ever recorded: the page
  // says WHERE the speech is turned into text, which is what changes.
  if (i.mic === 'blocked') rows.push({ id: 'voice', where: 'device', state: 'blocked', vars: {} });
  else if (i.mic !== 'granted') rows.push({ id: 'voice', where: 'device', state: 'off', vars: {} });
  else if (i.onlineVoiceConsent) rows.push({ id: 'voice', where: 'thirdParty', state: 'online', vars: {} });
  else rows.push({ id: 'voice', where: 'device', state: 'device', vars: {} });

  if (!i.notificationsAllowed) rows.push({ id: 'notifications', where: 'device', state: 'off', vars: {} });
  else if (i.signedIn) rows.push({ id: 'notifications', where: 'account', state: 'friends', vars: {} });
  else rows.push({ id: 'notifications', where: 'device', state: 'local', vars: {} });

  rows.push({
    id: 'ads',
    where: 'thirdParty',
    state: 'ads',
    vars: { minutes: Math.round(INTERSTITIAL_MIN_GAP_MS / 60_000) },
  });
  rows.push({ id: 'crash', where: 'thirdParty', state: 'crash', vars: {} });
  return rows;
}

// Which features work without a connection, and which ask for one. Keys only;
// order is the order shown.
export const WORKS_OFFLINE = ['habits', 'reminders', 'widget', 'voice'] as const;
export const NEEDS_INTERNET = ['account', 'friends', 'onlineVoice', 'ads'] as const;
