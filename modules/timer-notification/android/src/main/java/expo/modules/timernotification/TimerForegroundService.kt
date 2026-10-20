package expo.modules.timernotification

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import org.json.JSONObject

// Çalışırken zamanlayıcı kartının sahibi. Kart bu servisin foreground
// bildirimi olduğu için süreç öldürülmeye karşı korunur ve kart son
// uygulamalardan silmeyle kaybolmaz. Durum TimerNotifier'ın SharedPreferences
// kaydından okunur (sistem servisi yeniden başlatırsa kart sıfırdan kurulur).
class TimerForegroundService : Service() {
  companion object {
    @Volatile var instance: TimerForegroundService? = null
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
  }

  override fun onDestroy() {
    if (instance === this) instance = null
    super.onDestroy()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val state = TimerNotifier.loadState(this)
    if (state == null || !state.optBoolean("running", false)) {
      stopSelf()
      return START_NOT_STICKY
    }
    try {
      val notification = TimerNotifier.build(this, state)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(TimerNotifier.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(TimerNotifier.NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      // Foreground'a geçilemedi: kart yine sıradan bildirim olarak kalır.
      stopSelf()
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  // Duraklat/Bitir: servisten çık. keepCard ise kart (donuk) kalır.
  fun release(keepCard: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(if (keepCard) STOP_FOREGROUND_DETACH else STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION") stopForeground(!keepCard)
    }
    stopSelf()
  }
}
