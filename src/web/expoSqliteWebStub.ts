// WEB-ONLY stand-in for expo-sqlite (metro.config.js), which has no web build
// and crashes on import. Reads return nothing and writes do nothing — only so
// screens can be looked at in a browser; data flows need a device build.

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
