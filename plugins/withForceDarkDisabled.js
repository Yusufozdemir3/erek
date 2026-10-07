// Turns off Android's "force dark" (android:forceDarkAllowed=false on AppTheme).
// On API 29+ the OS may darken the app itself (MIUI does it aggressively),
// fighting the in-app theme choice. ThemeProvider alone decides light/dark.
// android/ is generated, hence a plugin.

const { withAndroidStyles, AndroidConfig } = require('@expo/config-plugins');

module.exports = function withForceDarkDisabled(config) {
  return withAndroidStyles(config, (cfg) => {
    // The template's AppTheme parent changes between SDKs (Light.NoActionBar in
    // 52, DayNight.NoActionBar in 53); a parent mismatch here adds a second
    // AppTheme and the resource merge fails. So reuse whatever the template has.
    const existing = (cfg.modResults.resources.style ?? []).find((s) => s.$.name === 'AppTheme');
    const parent = existing
      ? { name: 'AppTheme', parent: existing.$.parent }
      : AndroidConfig.Styles.getAppThemeGroup();
    cfg.modResults = AndroidConfig.Styles.assignStylesValue(cfg.modResults, {
      add: true,
      name: 'android:forceDarkAllowed',
      value: 'false',
      parent,
    });
    return cfg;
  });
};
