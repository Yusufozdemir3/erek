// AGP 9 turns on R8 "full mode", which strips constructors that libraries only
// reach by reflection: WorkManager (used by the widgets) lost its Room database
// and input merger, so the app crashed at launch and widgets never rendered.
// Compat mode is how R8 ran under AGP 8, where every screen was device-tested.
// (android/ is generated, hence a plugin.)

const { withGradleProperties } = require('expo/config-plugins');

const KEY = 'android.enableR8.fullMode';

module.exports = function withR8CompatMode(config) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === KEY));
    cfg.modResults.push({ type: 'property', key: KEY, value: 'false' });
    return cfg;
  });
};
