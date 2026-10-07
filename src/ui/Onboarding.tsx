// The first-launch gate of the setup wizard (ui/setupWizard), plus what other
// modules need from it: the "seen" flag and the "finished" event. Finishing or
// skipping writes the flag; Profile › Setup wizard runs it again.

import { useEffect, useState } from 'react';
import { Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { announceGatesClosed, markNewInstall } from '@/lib/guides';
import { SetupWizard, type WizardResult } from '@/ui/setupWizard/SetupWizard';

const SEEN_KEY = 'onboarding:done';

// Lives here because the wizard sets it and LoginScreen already imports this file.
export const LOGIN_SEEN_KEY = 'login:seen';

// The wizard comes first, the login screen second: LoginGate waits for this
// flag and hears the moment the wizard closes. A wizard that reached its
// account step marks the login screen seen before announcing it.
export const ONBOARDING_SEEN_KEY = SEEN_KEY;

type Listener = () => void;
const doneListeners = new Set<Listener>();

/** Fires when the wizard finishes or is skipped; returns an unsubscribe. */
export function onOnboardingDone(fn: Listener): () => void {
  doneListeners.add(fn);
  return () => doneListeners.delete(fn);
}

export function OnboardingGate() {
  const [seen, setSeen] = useState<boolean | null>(null); // null = not read yet

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY).then((v) => {
      // A new install: feature guides may open by themselves later (lib/guides.ts).
      if (v !== '1') markNewInstall();
      setSeen(v === '1');
    });
  }, []);

  if (seen !== false) return null;

  const done = async (r: WizardResult) => {
    setSeen(true);
    await AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
    if (r.accountSeen) await AsyncStorage.setItem(LOGIN_SEEN_KEY, '1').catch(() => {});
    for (const fn of doneListeners) fn();
    announceGatesClosed();
  };

  return (
    <Modal visible animationType="fade" onRequestClose={() => done({ skippedAll: true, accountSeen: false })}>
      <SetupWizard onDone={done} />
    </Modal>
  );
}
