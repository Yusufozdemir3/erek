package expo.modules.timernotification

import android.os.Bundle
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// The native widgets' bridge (src/widget/nativeWidgets.ts): JS publishes the
// board, takes the queued taps, mirrors the JS widgets' taps. Ayrıntı: WidgetStore.
class ErekWidgetsModule : Module() {
  companion object {
    @Volatile private var instance: ErekWidgetsModule? = null
    // The app (AppData) subscribes while it runs; a headless widget task alone doesn't.
    @Volatile private var observed = false

    fun isJsAlive() = instance != null && observed

    fun notifyJs() {
      try {
        instance?.sendEvent("onAction", Bundle())
      } catch (e: Exception) {
        // JS not reachable: the queue is read on the next launch.
      }
    }
  }

  private fun context() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ErekWidgets")
    Events("onAction")

    OnCreate { instance = this@ErekWidgetsModule }
    OnDestroy { if (instance === this@ErekWidgetsModule) instance = null }
    OnStartObserving("onAction") { observed = true }
    OnStopObserving("onAction") { observed = false }

    Function("setBoard") { json: String ->
      val ctx = context()
      WidgetStore.setBoard(ctx, json)
      WidgetRender.updateAll(ctx)
    }

    Function("consumePending") { WidgetStore.consumePending(context()) }

    Function("patchHabit") { habitId: String, day: String, completed: Boolean, amount: Double ->
      val ctx = context()
      WidgetStore.patchHabit(ctx, habitId, day, completed, amount)
      WidgetRender.updateButtons(ctx)
    }

    Function("importPicks") { json: String ->
      val ctx = context()
      if (WidgetStore.importPicks(ctx, json)) WidgetRender.updateButtons(ctx)
    }
  }
}
