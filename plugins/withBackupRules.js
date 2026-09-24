// Excludes the SESSION TOKEN from Android's auto backup.
//
// PROBLEM (audit finding, P2): Expo's generated manifest has
// android:allowBackup="true" with no exclusion rules at all. That means the
// app's ENTIRE private directory (auto backup to Google Drive + device-to-
// device transfer) leaves the device. It contains:
//   - habitapp.db  → the user's own data; backing it up is the DESIRED
//     behavior (it's the only recovery path for someone using the app
//     without an account).
//   - AsyncStorage (RKStorage) → contains Supabase's PERSISTENT SESSION
//     (see src/sync/supabase.ts: storage: AsyncStorage, persistSession: true).
//     So when a backup was restored onto another device, that device could
//     access the cloud data without re-authenticating.
// The privacy policy also states in §1 that "if you don't sign in, no data
// leaves your device"; backup was the native-side exception to that.
//
// FIX: backup stays ENABLED (a real benefit for user data), only the
// `database` domain is excluded. AsyncStorage writes there; expo-sqlite
// writes under files/SQLite/ (domain "file"), so APP DATA stays in the backup.
//
// COST (accepted deliberately): on restore, app preferences (theme, language,
// notification settings, onboarding/login flags, sync watermarks) get reset.
// This is both a small cost and actually desired: carrying the sync
// ownership stamp and watermarks over to ANOTHER device could confuse sync's
// "which account does this data belong to" logic.
//
// TWO FILES ARE NEEDED: API 31+ reads dataExtractionRules, older versions
// read fullBackupContent. Since minSdk is 24, both are written.
//
// NOTE: the android/ folder isn't tracked in git (prebuild generates it). So
// this fix was written HERE rather than by hand-editing AndroidManifest.xml —
// it's applied automatically on every prebuild (same rationale as
// withForceDarkDisabled / withoutUnusedPermissions).

const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERATED FILE — sourced from plugins/withBackupRules.js, do not edit by hand. -->
<data-extraction-rules>
  <cloud-backup>
    <!-- AsyncStorage (RKStorage) lives here; it contains the Supabase session token. -->
    <exclude domain="database" path="." />
  </cloud-backup>
  <device-transfer>
    <exclude domain="database" path="." />
  </device-transfer>
</data-extraction-rules>
`;

const FULL_BACKUP_CONTENT = `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERATED FILE — sourced from plugins/withBackupRules.js, do not edit by hand. -->
<full-backup-content>
  <!-- AsyncStorage (RKStorage) lives here; it contains the Supabase session token. -->
  <exclude domain="database" path="." />
</full-backup-content>
`;

function withBackupRuleFiles(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const xmlDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, 'data_extraction_rules.xml'), DATA_EXTRACTION_RULES);
      fs.writeFileSync(path.join(xmlDir, 'backup_rules.xml'), FULL_BACKUP_CONTENT);
      return cfg;
    },
  ]);
}

function withBackupManifestAttributes(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) return cfg; // unexpected manifest — leave it alone
    application.$['android:dataExtractionRules'] = '@xml/data_extraction_rules'; // API 31+
    application.$['android:fullBackupContent'] = '@xml/backup_rules'; // API 30 and below
    return cfg;
  });
}

module.exports = function withBackupRules(config) {
  return withBackupManifestAttributes(withBackupRuleFiles(config));
};
