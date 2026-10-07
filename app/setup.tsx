// The setup wizard again, from Profile (full screen, its own controls).
// Whatever it creates is added to what exists.

import { router } from 'expo-router';
import { SetupWizard } from '@/ui/setupWizard/SetupWizard';

export default function SetupScreen() {
  return <SetupWizard onDone={() => router.back()} />;
}
