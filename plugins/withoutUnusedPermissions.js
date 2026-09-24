// The merged release manifest ended up with three permissions that are NEVER
// used anywhere in the codebase (ultra-detailed review finding, P1 #5):
//   - android.permission.SYSTEM_ALERT_WINDOW ("display over other apps") —
//     comes from expo-dev-client's own manifest, only needed for its dev
//     menu; meaningless in a release build AND a sensitive permission Play
//     specifically flags (it can be used for overlay attacks).
//   - android.permission.READ_EXTERNAL_STORAGE / WRITE_EXTERNAL_STORAGE —
//     come from expo-file-system; that package is only there so expo-asset
//     can load icon fonts, no user data is written to the file system.
//     WRITE_EXTERNAL_STORAGE is already a no-op on API 33+, pure noise.
//
// The manifest merger can REMOVE permissions coming from library manifests
// from the main manifest via tools:node="remove" (the opposite of
// withPermissions adding one). These three are removed here — an app that
// positions itself as "on-device first, privacy-respecting" asking to
// "display over other apps" at install time is both a red flag in store
// review and damaging to user trust.
//
// NOTE: the android/ folder isn't tracked in git (prebuild generates it). So
// this fix was written HERE rather than by hand-editing AndroidManifest.xml —
// it's applied automatically on every prebuild (same rationale as
// withForceDarkDisabled).

const { withAndroidManifest } = require('@expo/config-plugins');

const REMOVED_PERMISSIONS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];

module.exports = function withoutUnusedPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';
    manifest['uses-permission'] = manifest['uses-permission'] || [];
    for (const name of REMOVED_PERMISSIONS) {
      manifest['uses-permission'].push({
        $: { 'android:name': name, 'tools:node': 'remove' },
      });
    }
    return cfg;
  });
};
