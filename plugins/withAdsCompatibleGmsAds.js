// react-native-google-mobile-ads pins play-services-ads 24.6.0, compiled with
// Kotlin 2.1 metadata, which RN 0.76's Kotlin 1.9.25 can't read ("Incompatible
// classes were found in dependencies"). Pin that one dependency to 23.6.0
// instead of upgrading the project's Kotlin. Drop this once the ads package
// or the project's Kotlin catches up. (android/ is generated, hence a plugin.)

const { withProjectBuildGradle } = require('@expo/config-plugins');

const FORCE_BLOCK = `
    configurations.all {
        resolutionStrategy {
            force 'com.google.android.gms:play-services-ads:23.6.0'
        }
    }`;

module.exports = function withAdsCompatibleGmsAds(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes("play-services-ads:23.6.0")) return cfg; // already applied
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /allprojects\s*\{/,
      (match) => `${match}\n${FORCE_BLOCK}`
    );
    return cfg;
  });
};
