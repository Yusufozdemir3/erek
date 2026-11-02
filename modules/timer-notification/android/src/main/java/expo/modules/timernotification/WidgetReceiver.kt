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
          WidgetLists.updateLists(ctx)
          ErekWidgetsModule.notifyJs()
          WidgetRender.pokeJsWidgets(ctx)
        } else {
          WidgetRender.updateButton(ctx, widgetId)
        }
      }
      "row_toggle", "row_inc", "row_task" -> {
        val ok = if (op == "row_task") {
          WidgetStore.tapTask(ctx, intent.getStringExtra("taskId") ?: "", at)
        } else {
          WidgetStore.tapRow(ctx, intent.getStringExtra("habitId") ?: "", op.removePrefix("row_"), at)
        }
        if (ok) {
          WidgetRender.updateButtons(ctx)
          ErekWidgetsModule.notifyJs()
          WidgetRender.pokeJsWidgets(ctx)
        }
        WidgetLists.updateLists(ctx)
      }
      // Best-effort: the system may refuse to start an activity from here.
      "row_open" -> try {
        ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
          ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let { ctx.startActivity(it) }
      } catch (e: Exception) {
      }
      // A Today-list timer row: start it, or pause / resume it if its card is the active one.
      "row_timer" -> {
        val id = intent.getStringExtra("habitId") ?: ""
        val s = TimerNotifier.loadState(ctx)
        val mine = s != null && s.optString("kind") == "habit" && s.optString("id") == id
        val next = if (!mine) "start" else if (s!!.optBoolean("running", false)) "pause" else "resume"
        TimerNotifier.handle(ctx, next, at, id)
        TimerNotificationModule.notifyJs()
        WidgetLists.updateLists(ctx)
      }
      "start", "pause", "resume", "finish" -> {
        TimerNotifier.handle(ctx, op, at, intent.getStringExtra("habitId"))
        TimerNotificationModule.notifyJs()
        WidgetLists.updateLists(ctx) // the Today list's timer rows show ▶ / ⏸
      }
      "tick" -> WidgetRender.updateTimers(ctx)
      "midnight" -> WidgetRender.updateAll(ctx)
    }
  }
}
