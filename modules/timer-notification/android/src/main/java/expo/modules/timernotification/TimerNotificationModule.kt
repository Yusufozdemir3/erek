package expo.modules.timernotification

import android.os.Bundle
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

// Çalışan zamanlayıcı için kalıcı bildirim kartı (ayrıntı: TimerNotifier).
// JS kartı show ile kurar; düğme basışları native işlenir ve consumePending ile
// alınır. Uygulama canlıysa onAction olayı hemen haber verir.
class TimerNotificationModule : Module() {
  companion object {
    @Volatile private var instance: TimerNotificationModule? = null

    fun notifyJs() {
      try {
        instance?.sendEvent("onAction", Bundle())
      } catch (e: Exception) {
        // JS not reachable: the queue is read on the next launch.
      }
    }
  }

  private fun context() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("TimerNotification")
    Events("onAction")

    OnCreate { instance = this@TimerNotificationModule }
    OnDestroy { if (instance === this@TimerNotificationModule) instance = null }

    Function("show") { opts: Map<String, Any?> -> TimerNotifier.post(context(), JSONObject(opts)) }

    Function("cancel") { TimerNotifier.cancel(context()) }

    Function("consumePending") { TimerNotifier.consumePending(context()) }
  }
}
