package com.erek.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Bundle
import expo.modules.timernotification.WidgetLists
import expo.modules.timernotification.WidgetRender
import expo.modules.timernotification.WidgetStore

// The native widgets' providers. Evet/Hayır and Sayaç düğmesi keep the class
// names the react-native-android-widget versions had (com.erek.widget.*), so
// widgets already on a home screen carry over to the native ones on update.
// Drawing: expo.modules.timernotification.WidgetRender.

class ErekHabitCheck : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
    for (id in ids) WidgetRender.updateButton(ctx, id)
  }

  override fun onAppWidgetOptionsChanged(ctx: Context, mgr: AppWidgetManager, id: Int, opts: Bundle) {
    WidgetRender.updateButton(ctx, id)
  }

  override fun onDeleted(ctx: Context, ids: IntArray) {
    for (id in ids) WidgetStore.setPick(ctx, id, null)
  }
}

class ErekHabitCount : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
    for (id in ids) WidgetRender.updateButton(ctx, id)
  }

  override fun onAppWidgetOptionsChanged(ctx: Context, mgr: AppWidgetManager, id: Int, opts: Bundle) {
    WidgetRender.updateButton(ctx, id)
  }

  override fun onDeleted(ctx: Context, ids: IntArray) {
    for (id in ids) WidgetStore.setPick(ctx, id, null)
  }
}

// One widget, two faces by size (small 2×1, wide 4×2+).
class ErekTimer : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
    WidgetRender.updateTimers(ctx)
  }

  override fun onAppWidgetOptionsChanged(ctx: Context, mgr: AppWidgetManager, id: Int, opts: Bundle) {
    WidgetRender.updateTimers(ctx)
  }
}

// The list widgets (Bugün, Sayaç, Görevler, Hedefler) and Hızlı görev. Same class
// names as the react-native-android-widget versions, so widgets already placed
// carry over on update. Drawing: WidgetLists.
open class ErekListProvider : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
    WidgetLists.updateLists(ctx)
  }
}

class ErekToday : ErekListProvider()
class ErekCounter : ErekListProvider()
class ErekTasks : ErekListProvider()
class ErekGoals : ErekListProvider()

class ErekQuickAdd : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
    WidgetLists.updateQuickAdds(ctx)
  }
}
