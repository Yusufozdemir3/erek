// RECORD_AUDIO makes Play assume a microphone is required and hide the app from
// devices without one. Voice input is optional, so the feature is declared not
// required. android/ is generated, hence a plugin.

const { withAndroidManifest } = require('@expo/config-plugins');

const FEATURE = 'android.hardware.microphone';

module.exports = function withOptionalMicrophone(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const features = (manifest['uses-feature'] || []).filter((f) => f.$?.['android:name'] !== FEATURE);
    features.push({ $: { 'android:name': FEATURE, 'android:required': 'false' } });
    manifest['uses-feature'] = features;
    return cfg;
  });
};
