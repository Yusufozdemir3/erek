// DISABLES Android's "force dark" feature.
//
// WHY: The app manages its own theme (Profile > Appearance: Light/Dark/System
// + dark style + accent color; see src/ui/ThemeProvider.tsx). But the native
// Android theme is Theme.AppCompat.Light.NoActionBar, and on API 29+
// android:forceDarkAllowed DEFAULTS to true for apps with a "light" theme
// like this one. When the phone is in dark mode, the OS FORCIBLY darkens the
// app's light surfaces — the screen stayed dark even if the user picked
// "Light" in Profile (since accent colors still switched to the light
// palette, it produced an odd "half light/half dark" look). MIUI/Xiaomi
// applies this especially aggressively; it went unnoticed on stock/emulator
// because it's off there by default (reproduced exactly on the emulator with
// `setprop debug.hwui.force_dark true`).
//
// This plugin adds android:forceDarkAllowed=false to AppTheme → the OS never
// darkens anything, light/dark stays entirely under ThemeProvider's control.
//
// NOTE: the android/ folder isn't tracked in git (prebuild generates it). So
// this fix was written HERE rather than by hand-editing styles.xml — it's
// applied automatically on every prebuild.

const { withAndroidStyles, AndroidConfig } = require('@expo/config-plugins');

module.exports = function withForceDarkDisabled(config) {
  return withAndroidStyles(config, (cfg) => {
    cfg.modResults = AndroidConfig.Styles.assignStylesValue(cfg.modResults, {
      add: true,
      name: 'android:forceDarkAllowed',
      value: 'false',
      parent: AndroidConfig.Styles.getAppThemeLightNoActionBarGroup(),
    });
    return cfg;
  });
};
