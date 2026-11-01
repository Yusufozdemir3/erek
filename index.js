// Entry point: the expo-router root, plus (real builds only) the widgets'
// background task handler — the widget library can throw in Expo Go.

import './src/lib/safeImmediate';
import 'expo-router/entry';

try {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widget/widgetTaskHandler');
  registerWidgetTaskHandler(widgetTaskHandler);
} catch {
  // Expo Go: no widgets.
}
