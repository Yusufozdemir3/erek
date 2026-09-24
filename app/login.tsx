// Login route (modal) — a user who skipped the opening gate with "Skip for now"
// comes here later from Profile. The screen itself lives in src/ui/LoginScreen.tsx:
// the same component is used both here and in the opening gate (LoginGate), a
// single source. When opened from here there's NO "skip" button — the user
// already came here deliberately; closing the modal is enough to back out.

import { router } from 'expo-router';
import { LoginScreen } from '@/ui/LoginScreen';

export default function LoginRoute() {
  return <LoginScreen onDone={() => router.back()} />;
}
