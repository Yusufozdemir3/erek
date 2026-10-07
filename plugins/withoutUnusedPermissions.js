// Removes three permissions the app never uses from the release manifest:
//   - SYSTEM_ALERT_WINDOW ("display over other apps") — from expo-dev-client's
//     dev menu; sensitive, and flagged in Play review;
//   - READ/WRITE_EXTERNAL_STORAGE — from expo-file-system, which is only here
//     for expo-asset's icon fonts; no user data touches shared storage.
// android/ is generated, hence a plugin.

const { withAndroidManifest } = require('@expo/config-plugins');

const REMOVED_PERMISSIONS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];

// One tools:node="remove" marker per permission and no plain declaration left:
// other plugins also add these as plain lines, which a marker (it only acts on
// library manifests) doesn't remove. Idempotent across prebuilds; tested in plugins/__tests__.
function applyRemovals(manifest) {
  manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';
  const keep = (manifest['uses-permission'] || []).filter(
    (p) => !REMOVED_PERMISSIONS.includes(p.$['android:name'])
  );
  manifest['uses-permission'] = [
    ...keep,
    ...REMOVED_PERMISSIONS.map((name) => ({ $: { 'android:name': name, 'tools:node': 'remove' } })),
  ];
}

module.exports = function withoutUnusedPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    applyRemovals(cfg.modResults.manifest);
    return cfg;
  });
};
module.exports.applyRemovals = applyRemovals;
module.exports.REMOVED_PERMISSIONS = REMOVED_PERMISSIONS;
