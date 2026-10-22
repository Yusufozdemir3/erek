// Signs local release builds with the Play upload key. Since SDK 57 every
// prebuild regenerates android/, so the hand-edited signing block of the local
// Gradle recipe would be lost each time (android/ is generated, hence a plugin).
//
// The key's path and passwords stay outside the repo, in ~/.gradle/gradle.properties:
//   EREK_UPLOAD_STORE_FILE, EREK_UPLOAD_STORE_PASSWORD, EREK_UPLOAD_KEY_ALIAS,
//   EREK_UPLOAD_KEY_PASSWORD
// Without them (EAS, other machines) release keeps the template's debug signing,
// with a Gradle warning unless -PerekDebugSign asked for it.
// `-PerekDebugSign` forces debug signing for a device-test APK: Google sign-in
// only accepts the Play and debug certificates, not the upload key.

const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// erek-release-signing';

const RELEASE_CONFIG = `
        release { ${MARKER}
            if (project.hasProperty('EREK_UPLOAD_STORE_FILE')) {
                storeFile file(EREK_UPLOAD_STORE_FILE)
                storePassword EREK_UPLOAD_STORE_PASSWORD
                keyAlias EREK_UPLOAD_KEY_ALIAS
                keyPassword EREK_UPLOAD_KEY_PASSWORD
            } else if (!project.hasProperty('erekDebugSign')) {
                // Play rejects a debug-signed upload: say so before an 8-minute build, not after.
                logger.warn('erek: EREK_UPLOAD_* not set, release is signed with the DEBUG key (fine for a device test, not for Play)')
            }
        }`;

const RELEASE_SIGNING =
  "signingConfig(project.hasProperty('EREK_UPLOAD_STORE_FILE') && !project.hasProperty('erekDebugSign') ? signingConfigs.release : signingConfigs.debug)";

function applySigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;
  const withConfig = gradle.replace(/signingConfigs\s*\{/, (m) => `${m}${RELEASE_CONFIG}`);
  // The release build type's line; debug's own `signingConfig signingConfigs.debug` stays.
  const withBuildType = withConfig.replace(
    /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
    `$1${RELEASE_SIGNING}`
  );
  if (withConfig === gradle || withBuildType === withConfig) {
    throw new Error('withReleaseSigning: app/build.gradle no longer matches the expected template');
  }
  return withBuildType;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = applySigning(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.applySigning = applySigning;
