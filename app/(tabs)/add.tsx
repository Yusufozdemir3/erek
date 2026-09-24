// Route file for the middle ＋ tab. NOT a real screen: _layout.tsx completely
// replaces its tabBarButton, so this is normally never reached at all (the
// button opens AddSheet instead of navigating). If it's still reached somehow
// (e.g. a deep link), redirect to Today.

import { Redirect } from 'expo-router';

export default function AddScreen() {
  return <Redirect href="/" />;
}
