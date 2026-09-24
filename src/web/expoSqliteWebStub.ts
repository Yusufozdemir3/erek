// WEB-ONLY stand-in — replaces expo-sqlite (see metro.config.js).
//
// expo-sqlite 15.x has NO web/wasm build (no .web.js in the package, no
// browser field). Importing it on web throws at module-load time ("Cannot
// find native module 'ExpoSQLite'") — the ENTIRE app was crashing before even
// a single screen could open. Metro only routes here when platform==='web';
// Android/iOS builds never touch this file and keep using the real native module.
//
// THIS IS NOT A REAL DATABASE: every read returns empty (null/[]), every
// write is a no-op. The only goal is for the app to open so screens
// (styling/layout/navigation) can be viewed in the Browser pane — to check
// visual changes without doing a real build. NOT for testing data flows
// (sync, streak computation, etc.); a real device build is required for that.

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
