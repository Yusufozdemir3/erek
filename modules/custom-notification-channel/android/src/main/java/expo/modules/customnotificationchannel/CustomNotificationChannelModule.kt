package expo.modules.customnotificationchannel

import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// expo-notifications'ın JS'e açtığı kanal API'si `sound` alanına yalnızca
// uygulamaya gömülü bir ses dosyasının adını kabul eder (res/raw'da arar,
// bulamazsa sessizce varsayılan sese düşer) — cihazın zil sesi seçicisinden
// gelen content:// URI'yi ASLA doğrudan kanala uygulayamaz. Bu modül o sınırı
// aşar: NotificationChannel.setSound'u ham Uri ile çağırır.
//
// Android'de bir kanalın sesi/titreşimi OLUŞTURULDUKTAN SONRA koddan
// değiştirilemez (yalnız kullanıcı sistem ayarından). Bu yüzden JS tarafı ses
// tercihi değişince createChannel'ı YENİ bir channelId ile çağırır; eski kanal
// öylece kalır (ID'si bir daha kullanılmaz).
class CustomNotificationChannelModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CustomNotificationChannel")

    Function("createChannel") { channelId: String, name: String, soundUri: String?, vibrate: Boolean ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@Function
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val manager = context.getSystemService(NotificationManager::class.java) ?: return@Function

      val channel = NotificationChannel(channelId, name, NotificationManager.IMPORTANCE_DEFAULT)
      if (soundUri != null) {
        val attrs = AudioAttributes.Builder()
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .setUsage(AudioAttributes.USAGE_NOTIFICATION)
          .build()
        channel.setSound(Uri.parse(soundUri), attrs)
      } else {
        channel.setSound(null, null)
      }
      channel.enableVibration(vibrate)
      if (vibrate) {
        channel.vibrationPattern = longArrayOf(0, 250, 250, 250)
      }
      manager.createNotificationChannel(channel)
    }

    // Artık kullanılmayan eski özel-ses kanallarını temizler (ör. kullanıcı
    // sesi tekrar tekrar değiştirince biriken eski channelId'ler).
    Function("deleteChannel") { channelId: String ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@Function
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val manager = context.getSystemService(NotificationManager::class.java) ?: return@Function
      manager.deleteNotificationChannel(channelId)
    }

    // Seçilen sesin görünen adı (Profil'de göstermek için) — alınamazsa null.
    Function("getSoundTitle") { soundUri: String ->
      val context = appContext.reactContext ?: return@Function null
      try {
        RingtoneManager.getRingtone(context, Uri.parse(soundUri))?.getTitle(context)
      } catch (e: Exception) {
        null
      }
    }
  }
}
