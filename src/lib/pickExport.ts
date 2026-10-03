// Lets the user pick an Erek export file and reads it. The picker hands us a
// temporary copy in the app's cache; it's deleted as soon as it has been read.
// What's in the file is checked by db/importData.ts (parseExport) — this module
// only moves bytes.

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { MAX_IMPORT_BYTES, parseExport, type ParseResult } from '@/db/importData';

export type PickResult = { kind: 'cancelled' } | { kind: 'parsed'; result: ParseResult };

export async function pickExportFile(): Promise<PickResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    // Some file managers label .json as text/plain or octet-stream: accept any
    // type and let the parser decide.
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.[0]) return { kind: 'cancelled' };
  const asset = picked.assets[0];
  try {
    if (typeof asset.size === 'number' && asset.size > MAX_IMPORT_BYTES) {
      return { kind: 'parsed', result: { ok: false, reason: 'tooLarge' } };
    }
    const text = await FileSystem.readAsStringAsync(asset.uri);
    return { kind: 'parsed', result: parseExport(text) };
  } finally {
    await FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => {});
  }
}
