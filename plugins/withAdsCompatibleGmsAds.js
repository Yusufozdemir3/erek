// The play-services-ads version (24.6.0) pinned by react-native-google-mobile-ads
// is compiled with Kotlin 2.1 metadata; this project's Kotlin Gradle plugin is
// 1.9.25 (RN 0.76's default), which can only read metadata up to 2.0.0.
// Result: `:react-native-google-mobile-ads:compileReleaseKotlin` blew up with
// "Incompatible classes were found in dependencies" — changing the ads
// package's JS version doesn't help, the native SDK version is pinned the
// same way in every release.
//
// FIX: force play-services-ads to a version known to be Kotlin 1.9-compatible
// (23.6.0) — only THIS dependency's version is pinned, the project's Kotlin
// version is NOT touched (that would be a much bigger, riskier change).
//
// NOTE: the android/ folder isn't tracked in git (prebuild generates it). So
// this fix was written HERE rather than by hand-editing build.gradle — it's
// applied automatically on every prebuild (same rationale as
// withForceDarkDisabled).
//
// FUTURE: if a newer react-native-google-mobile-ads release pins a
// Kotlin-1.9-compatible play-services-ads version on its own (or the project
// moves to Kotlin 2.x), this plugin can be removed — the forced version
// would then just be an unnecessary ceiling.

const { withProjectBuildGradle } = require('@expo/config-plugins');

const FORCE_BLOCK = `
    configurations.all {
        resolutionStrategy {
            force 'com.google.android.gms:play-services-ads:23.6.0'
        }
    }`;

module.exports = function withAdsCompatibleGmsAds(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes("play-services-ads:23.6.0")) return cfg; // idempotent
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /allprojects\s*\{/,
      (match) => `${match}\n${FORCE_BLOCK}`
    );
    return cfg;
  });
};
