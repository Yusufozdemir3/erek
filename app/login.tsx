// Login opened from Profile later (no "skip" — the user came on purpose).
// The screen is ui/LoginScreen.tsx, shared with the first-launch gate.

import { router } from 'expo-router';
import { LoginScreen } from '@/ui/LoginScreen';

export default function LoginRoute() {
  return <LoginScreen onDone={() => router.back()} />;
}
