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

// expo-notifications kanala yalnızca uygulamaya gömülü bir sesi verebilir;
// telefonda seçilen zil sesi (content:// URI) için bu modül
// NotificationChannel.setSound'u ham Uri ile çağırır. Bir kanalın sesi sonradan
// değişmediğinden JS her yeni ses için yeni bir channelId kullanır.
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

    // Seçilen sesin görünen adı; alınamazsa null.
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
