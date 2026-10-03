// First-launch gate for the setup wizard (ui/setupWizard). The wizard replaced
// the old 4-slide intro; this file keeps the gate and the two things other
// modules depend on: the "seen" flag and the "onboarding finished" event.
//
// OnboardingGate sits next to the Stack in the root layout: renders nothing until
// the flag loads (doesn't delay startup), and opens the wizard full screen if
// unseen. Finishing OR skipping it (any page, or all of it) writes the flag; it
// can be run again from Profile › Setup wizard.

import { useEffect, useState } from 'react';
import { Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SetupWizard, type WizardResult } from '@/ui/setupWizard/SetupWizard';

const SEEN_KEY = 'onboarding:done';

// The login screen's own "seen" flag lives here (not in LoginScreen) because the
// wizard has to set it, and LoginScreen already imports this file.
export const LOGIN_SEEN_KEY = 'login:seen';

// — ORDER: ONBOARDING FIRST, LOGIN SECOND —
// The login gate (LoginGate) also opens an independent Modal in the root layout.
// There used to be no ordering between the two, and on a real first launch both
// mounted at the same time, with the login screen ending up on top of onboarding.
// LoginGate now watches this flag; there's a small notification so it hears about
// it the instant onboarding closes (instead of polling AsyncStorage — the flag is
// already being written in this same process).
// The wizard has its own account page, so when the user got that far the login
// screen is marked seen BEFORE this notification goes out (LoginGate re-reads it).
export const ONBOARDING_SEEN_KEY = SEEN_KEY;

type Listener = () => void;
const doneListeners = new Set<Listener>();

/** Notifies when onboarding completes (or is skipped); returns an unsubscribe function. */
export function onOnboardingDone(fn: Listener): () => void {
  doneListeners.add(fn);
  return () => doneListeners.delete(fn);
}

// Gate placed on the root layout: reads the flag, shows the wizard if unseen.
export function OnboardingGate() {
  const [seen, setSeen] = useState<boolean | null>(null); // null = not known yet

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY).then((v) => setSeen(v === '1'));
  }, []);

  if (seen !== false) return null;

  const done = async (r: WizardResult) => {
    setSeen(true);
    await AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
    if (r.accountSeen) await AsyncStorage.setItem(LOGIN_SEEN_KEY, '1').catch(() => {});
    for (const fn of doneListeners) fn();
  };

  return (
    <Modal visible animationType="fade" onRequestClose={() => done({ skippedAll: true, accountSeen: false })}>
      <SetupWizard onDone={done} />
    </Modal>
  );
}
