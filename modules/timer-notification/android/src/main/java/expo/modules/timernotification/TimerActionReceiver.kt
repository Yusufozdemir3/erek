package expo.modules.timernotification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Bildirim düğmelerinin hedefi. Uygulamayı açmaz (ekran kapalıyken de çalışır):
// kartı günceller, basışı kuyruğa yazar; JS canlıysa haberdar edilir.
class TimerActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != TimerNotifier.ACTION) return
    val op = intent.getStringExtra("op") ?: return
    TimerNotifier.handle(context.applicationContext, op, System.currentTimeMillis())
    TimerNotificationModule.notifyJs()
  }
}
