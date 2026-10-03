// "Setup wizard" route — the same wizard that runs on first launch, reopened from
// Profile › Setup wizard. Full screen, no native header (the wizard has its own
// progress bar and skip controls). Anything it creates is added to what exists.

import { router } from 'expo-router';
import { SetupWizard } from '@/ui/setupWizard/SetupWizard';

export default function SetupScreen() {
  return <SetupWizard onDone={() => router.back()} />;
}
