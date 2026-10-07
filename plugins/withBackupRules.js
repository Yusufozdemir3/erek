// Keeps the session out of Android auto backup. Backup stays on (the database
// is the only recovery path for someone without an account), but the
// `database` domain — where AsyncStorage lives, with the encrypted Supabase
// session and the sync markers — is excluded: restored onto another phone it
// could reach the cloud without signing in, or confuse sync's ownership logic.
// Preferences reset on restore, deliberately. expo-sqlite writes under
// files/SQLite/, so the data itself is still backed up.
// API 31+ reads dataExtractionRules, older versions fullBackupContent: both
// are written (minSdk 24). android/ is generated, hence a plugin.

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
    if (!application) return cfg; // unexpected manifest
    application.$['android:dataExtractionRules'] = '@xml/data_extraction_rules'; // API 31+
    application.$['android:fullBackupContent'] = '@xml/backup_rules'; // API 30 and below
    return cfg;
  });
}

module.exports = function withBackupRules(config) {
  return withBackupManifestAttributes(withBackupRuleFiles(config));
};
