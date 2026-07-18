// Native köprü: expo-notifications'ın kanal API'si `sound` alanına yalnızca
// uygulamaya gömülü bir ses dosyasının ADINI kabul eder (basename ile res/raw'da
// arar; bulamazsa SESSİZCE varsayılan sese düşer). Cihazın zil sesi seçicisinden
// gelen content:// URI bu yolla ASLA uygulanamaz. modules/custom-notification-channel
// bu sınırı NotificationChannel.setSound'u ham Uri ile çağırarak aşar.
//
// YENİ NATIVE MODÜL — Expo Go'da ve henüz derlenmemiş build'lerde YOK. Lazy
// require + try/catch (widget'taki src/widget/widgetTaskHandler ile aynı
// güvenlik deseni): bulunamazsa sessizce pasif kalır, çağıran sabit kanallara düşer.

import { Platform } from 'react-native';

interface NativeApi {
  createChannel(channelId: string, name: string, soundUri: string | null, vibrate: boolean): void;
  deleteChannel(channelId: string): void;
  getSoundTitle(soundUri: string): string | null;
}

function loadNative(): NativeApi | null {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../modules/custom-notification-channel/src/CustomNotificationChannelModule').default as NativeApi;
  } catch {
    return null;
  }
}

// Basit bir hash (djb2 varyantı) — özel ses URI'sinden deterministik, kısa bir
// kanal id'si üretir. Ayrı bir sürüm sayacı GEREKMEZ: URI değişince hash de
// değişir, Android'in "kanal oluşunca sesi koddan değiştirilemez" kısıtı
// doğal olarak yeni bir kanala düşer (eskisi sistemde öylece kalır).
function hashUri(uri: string): string {
  let h = 5381;
  for (let i = 0; i < uri.length; i++) h = (h * 33) ^ uri.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export function customChannelId(uri: string, vibrate: boolean): string {
  return `reminders-custom-${hashUri(uri)}-${vibrate ? 'v' : 'nv'}`;
}

// Kanalı (gerekirse) oluşturur/idempotent doğrular ve id'sini döner. Native
// modül yoksa (Expo Go / henüz derlenmemiş build) null döner — çağıran bu
// durumda sabit varsayılan kanallara düşmelidir.
export function ensureCustomSoundChannel(uri: string, vibrate: boolean, name: string): string | null {
  const native = loadNative();
  if (!native) return null;
  const id = customChannelId(uri, vibrate);
  try {
    native.createChannel(id, name, uri, vibrate);
    return id;
  } catch {
    return null;
  }
}

// Seçilen sesin görünen adı (RingtoneManager üzerinden) — alınamazsa null.
export function getCustomSoundTitle(uri: string): string | null {
  const native = loadNative();
  if (!native) return null;
  try {
    return native.getSoundTitle(uri);
  } catch {
    return null;
  }
}
