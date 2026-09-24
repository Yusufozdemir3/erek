// App entry point. Loads the expo-router root component and (only in a real
// build) registers the Android home screen widget's background task handler.
//
// react-native-android-widget should only be loaded when the native module is
// present (development/production build). Expo Go has no native module, and the
// package's barrel import can throw there; hence the require + try/catch guard.
// If it can't be imported, the app keeps working normally in Expo Go, just with
// the widget disabled.

import 'expo-router/entry';

try {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widget/widgetTaskHandler');
  registerWidgetTaskHandler(widgetTaskHandler);
} catch {
  // Expo Go / no native module — widget disabled, app starts up normally.
}
