// Cihazın sistem zil/bildirim sesi seçicisini açar (Android'e özgü). Seçilen
// content:// URI'yi expo-notifications DOĞRUDAN kullanamaz — kanal API'si
// yalnızca gömülü ses dosyası ADI kabul eder, arbitrary URI'de sessizce
// varsayılana düşer (bkz. customNotificationChannel.ts başındaki not). Bu
// yüzden URI, bizim native kanal modülümüze verilir.
//
// expo-intent-launcher bu turda YENİ eklendi (modules/custom-notification-channel
// ile aynı sebepten) — henüz derlenmemiş bir build'de (Expo Go dahil) native
// tarafı bulunamayabilir; dynamic import + try/catch ile sessizce iptal döner.

import { Platform } from 'react-native';

const RINGTONE_PICKER_ACTION = 'android.intent.action.RINGTONE_PICKER';
const EXTRA_TYPE = 'android.intent.extra.ringtone.TYPE';
const EXTRA_SHOW_DEFAULT = 'android.intent.extra.ringtone.SHOW_DEFAULT';
const EXTRA_SHOW_SILENT = 'android.intent.extra.ringtone.SHOW_SILENT';
const EXTRA_EXISTING_URI = 'android.intent.extra.ringtone.EXISTING_URI';
const EXTRA_PICKED_URI = 'android.intent.extra.ringtone.PICKED_URI';
const TYPE_NOTIFICATION = 2; // android.media.RingtoneManager.TYPE_NOTIFICATION

export interface RingtonePickResult {
  canceled: boolean;
  uri: string | null; // null = kullanıcı "Sessiz"i seçti (iptalde de null, ama canceled=true ile ayrılır)
}

export async function pickNotificationSound(existingUri?: string | null): Promise<RingtonePickResult> {
  if (Platform.OS !== 'android') return { canceled: true, uri: null };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const IntentLauncher = require('expo-intent-launcher');
    const result = await IntentLauncher.startActivityAsync(RINGTONE_PICKER_ACTION, {
      extra: {
        [EXTRA_TYPE]: TYPE_NOTIFICATION,
        [EXTRA_SHOW_DEFAULT]: true,
        [EXTRA_SHOW_SILENT]: true,
        ...(existingUri ? { [EXTRA_EXISTING_URI]: existingUri } : {}),
      },
    });
    if (result.resultCode !== IntentLauncher.ResultCode.Success) return { canceled: true, uri: null };
    const extra = (result.extra ?? {}) as Record<string, unknown>;
    const picked = extra[EXTRA_PICKED_URI];
    return { canceled: false, uri: typeof picked === 'string' ? picked : null };
  } catch (e) {
    console.warn('[Bildirim] Ses seçici açılamadı:', e); // native modül yok (Expo Go / eski build) ya da başka bir hata
    return { canceled: true, uri: null };
  }
}
