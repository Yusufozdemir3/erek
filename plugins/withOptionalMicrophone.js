// RECORD_AUDIO (voice input via expo-speech-recognition) makes Google Play
// IMPLY that the app requires a microphone (`uses-implied-feature`) and hide
// it from devices without one. Voice input is optional — every task can still
// be typed — so the feature is declared as not required.
//
// Lives here rather than in AndroidManifest.xml because android/ is generated
// by prebuild (same reasoning as withoutUnusedPermissions).

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
