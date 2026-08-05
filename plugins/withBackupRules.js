// Android otomatik yedeklemesinden OTURUM JETONUNU çıkarır.
//
// SORUN (denetim bulgusu, P2): Expo'nun ürettiği manifest'te
// android:allowBackup="true" ve hiçbir istisna kuralı yok. Bu, uygulamanın özel
// dizininin TAMAMININ (Google Drive'a otomatik yedek + cihazdan-cihaza aktarım)
// dışarı çıkması demek. İçinde şunlar var:
//   - habitapp.db  → kullanıcının kendi verisi; yedeklenmesi İSTENEN şey
//     (hesapsız kullanan biri için tek kurtarma yolu bu).
//   - AsyncStorage (RKStorage) → içinde Supabase'in KALICI OTURUMU var
//     (bkz. src/sync/supabase.ts: storage: AsyncStorage, persistSession: true).
//     Yani yedek başka bir cihaza geri yüklendiğinde o cihaz yeniden kimlik
//     doğrulamadan bulut verisine erişebiliyordu.
// Ayrıca gizlilik politikası §1 "giriş yapmazsanız hiçbir veri cihazınızdan
// çıkmaz" diyor; yedekleme bunun native tarafındaki istisnasıydı.
//
// ÇÖZÜM: yedekleme AÇIK kalır (kullanıcı verisi için gerçek bir fayda), yalnız
// `database` alanı dışlanır. AsyncStorage oraya yazar; expo-sqlite ise
// files/SQLite/ altına yazar (domain "file"), yani UYGULAMA VERİSİ yedekte kalır.
//
// BEDELİ (bilinçli): geri yüklemede uygulama tercihleri (tema, dil, bildirim
// ayarları, tanıtım/giriş bayrakları, senkron filigranları) sıfırlanır. Bu hem
// küçük bir bedel hem de istenen şey: senkron sahiplik damgası ile filigranların
// BAŞKA bir cihaza taşınması, senkronun "bu veri hangi hesaba ait" mantığını
// yanıltabilirdi.
//
// İKİ DOSYA GEREKİYOR: API 31+ dataExtractionRules'ı, daha eskiler
// fullBackupContent'i okur. minSdk 24 olduğu için ikisi de yazılır.
//
// NOT: android/ klasörü git'te izlenmiyor (prebuild üretir). Bu yüzden düzeltme
// elle AndroidManifest.xml'e değil BURAYA yazıldı — her prebuild'de otomatik
// uygulanır (withForceDarkDisabled / withoutUnusedPermissions ile aynı gerekçe).

const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<!-- ÜRETİLMİŞ DOSYA — kaynağı plugins/withBackupRules.js, elle düzenlemeyin. -->
<data-extraction-rules>
  <cloud-backup>
    <!-- AsyncStorage (RKStorage) burada; içinde Supabase oturum jetonu var. -->
    <exclude domain="database" path="." />
  </cloud-backup>
  <device-transfer>
    <exclude domain="database" path="." />
  </device-transfer>
</data-extraction-rules>
`;

const FULL_BACKUP_CONTENT = `<?xml version="1.0" encoding="utf-8"?>
<!-- ÜRETİLMİŞ DOSYA — kaynağı plugins/withBackupRules.js, elle düzenlemeyin. -->
<full-backup-content>
  <!-- AsyncStorage (RKStorage) burada; içinde Supabase oturum jetonu var. -->
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
    if (!application) return cfg; // beklenmedik manifest — sessizce dokunma
    application.$['android:dataExtractionRules'] = '@xml/data_extraction_rules'; // API 31+
    application.$['android:fullBackupContent'] = '@xml/backup_rules'; // API 30 ve altı
    return cfg;
  });
}

module.exports = function withBackupRules(config) {
  return withBackupManifestAttributes(withBackupRuleFiles(config));
};
