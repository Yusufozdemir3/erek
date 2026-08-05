// WEB-YALNIZ dublör — expo-sqlite'ın yerine geçer (bkz. metro.config.js).
//
// expo-sqlite 15.x'te web/wasm derlemesi YOK (paket içinde .web.js yok, browser
// alanı yok). Web'de import etmek modül-yükleme anında patlıyor ("Cannot find
// native module 'ExpoSQLite'") — uygulamanın TÜMÜ tek bir ekran bile açılmadan
// çöküyordu. Metro yalnızca platform==='web' iken buraya yönlendiriyor; Android/
// iOS derlemeleri bu dosyaya hiç dokunmaz, gerçek native modülü kullanmaya devam eder.
//
// BU GERÇEK BİR VERİTABANI DEĞİL: her okuma boş döner (null/[]), her yazma no-op'tur.
// Amaç yalnızca uygulamanın açılıp ekranların (stil/yerleşim/gezinme) Browser
// pane'de görülebilmesi — gerçek build almadan görsel değişiklikleri kontrol etmek
// için. Veri akışlarını (senkron, streak hesabı, vb.) test etmek için DEĞİL; onun
// için gerçek cihaz build'i şart.

function stubDb() {
  return {
    execSync() {},
    execAsync: async () => {},
    runSync() {
      return { changes: 0, lastInsertRowId: 0 };
    },
    runAsync: async () => ({ changes: 0, lastInsertRowId: 0 }),
    getFirstSync() {
      return null;
    },
    getFirstAsync: async () => null,
    getAllSync() {
      return [];
    },
    getAllAsync: async () => [],
    closeSync() {},
    closeAsync: async () => {},
  };
}

let instance: ReturnType<typeof stubDb> | null = null;

export function openDatabaseSync(): ReturnType<typeof stubDb> {
  if (!instance) instance = stubDb();
  return instance;
}

export async function openDatabaseAsync(): Promise<ReturnType<typeof stubDb>> {
  return openDatabaseSync();
}
