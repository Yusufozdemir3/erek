package expo.modules.timernotification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Every tap on the native widgets lands here (a broadcast: nothing opens, the
// app stays closed). The state changes natively, the widget redraws at once,
// and JS — if alive — is told to book the queue now.
class WidgetReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != WidgetRender.ACTION) return
    val ctx = context.applicationContext
    val at = System.currentTimeMillis()
    val widgetId = intent.getIntExtra("widgetId", -1)
    when (val op = intent.getStringExtra("op")) {
      "toggle", "inc" -> {
        if (WidgetStore.tapHabit(ctx, widgetId, op, at)) {
          // Two buttons may show the same habit.
          WidgetRender.updateButtons(ctx)
          ErekWidgetsModule.notifyJs()
          WidgetRender.pokeJsWidgets(ctx)
        } else {
          WidgetRender.updateButton(ctx, widgetId)
        }
      }
      "start", "pause", "resume", "finish" -> {
        TimerNotifier.handle(ctx, op, at, intent.getStringExtra("habitId"))
        TimerNotificationModule.notifyJs()
      }
      "tick" -> WidgetRender.updateTimers(ctx)
      "midnight" -> WidgetRender.updateAll(ctx)
    }
  }
}
