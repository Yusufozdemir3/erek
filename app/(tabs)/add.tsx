// Route file for the middle ＋ tab. NOT a real screen: _layout.tsx completely
// replaces its tabBarButton, so the button opens AddSheet instead of navigating.
// It IS reached by the deep link habitapp://add?step=task (the quick-add
// widget): it asks the tab layout to open the add form on that step, and
// lands on Today underneath. A bare /add opens the type menu.

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
