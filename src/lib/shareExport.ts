// Writes the data export to a temporary file and opens Android's share sheet
// (save to Drive/Files, send to yourself, ...). The file lives in the app's
// cache only for the moment of sharing and is deleted afterwards — Erek keeps
// no copy.

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { buildExport } from '@/db/exportData';
import { todayDate } from '@/lib/helpers';

export type ExportResult = 'shared' | 'unavailable';

export function exportFileName(today: string = todayDate()): string {
  return `erek-data-${today}.json`;
}

export async function shareDataExport(userId: string, dialogTitle: string): Promise<ExportResult> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  const uri = `${FileSystem.cacheDirectory}${exportFileName()}`;
  try {
    // Pretty-printed: the user may open it in a text editor.
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(buildExport(userId), null, 2));
    await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle, UTI: 'public.json' });
    return 'shared';
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}
