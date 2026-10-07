// The ＋ tab's route — not a real screen: _layout replaces its button. It's hit
// by the quick-add widget's link (habitapp://add?step=task), which asks the tab
// layout to open that form over Today. A bare /add opens the type menu.

import { useEffect } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { parseAddStep, requestAdd } from '@/lib/addRequest';

export default function AddScreen() {
  const { step } = useLocalSearchParams<{ step?: string }>();

  useEffect(() => {
    requestAdd(parseAddStep(step));
  }, [step]);

  return <Redirect href="/" />;
}
