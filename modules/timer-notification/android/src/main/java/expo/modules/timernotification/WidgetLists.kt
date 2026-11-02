package expo.modules.timernotification

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.erek.widget.ErekCounter
import com.erek.widget.ErekGoals
import com.erek.widget.ErekQuickAdd
import com.erek.widget.ErekTasks
import com.erek.widget.ErekToday
import org.json.JSONObject

// The scrolling list widgets (Bugün, Sayaç, Görevler, Hedefler) and Hızlı görev,
// drawn from WidgetStore's board like the other native widgets. The list rows
// come from a RemoteViewsService; a tap on a row is a broadcast to WidgetReceiver
// (toggle / +1 / task) or, for goals, opens the goal's screen.
class WidgetListService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
    ListFactory(applicationContext, intent.getStringExtra("kind") ?: WidgetLists.TODAY)
}

private class ListFactory(private val ctx: Context, private val kind: String) : RemoteViewsService.RemoteViewsFactory {
  private var board: JSONObject? = null
  private var rows: List<WidgetLists.Row> = emptyList()
  private var theme = WidgetRender.Theme(ctx, null)

  override fun onCreate() {}
  override fun onDataSetChanged() {
    val b = WidgetStore.boardForToday(ctx)
    board = b
    theme = WidgetRender.Theme(ctx, b)
    rows = WidgetLists.rows(b, kind)
  }

  override fun onDestroy() {}
  override fun getCount() = rows.size
  override fun getViewAt(position: Int): RemoteViews? {
    val row = rows.getOrNull(position) ?: return null
    return try {
      WidgetLists.rowViews(ctx, kind, row, theme, board)
    } catch (e: Exception) {
      null
    }
  }

  override fun getLoadingView(): RemoteViews? = null
  override fun getViewTypeCount() = 1
  override fun getItemId(position: Int) = position.toLong()
  override fun hasStableIds() = false
}

object WidgetLists {
  const val TODAY = "today"
  const val COUNTER = "counter"
  const val TASKS = "tasks"
  const val GOALS = "goals"

  class Row(val type: String, val o: JSONObject)

  private val PROVIDERS = listOf(
    ErekToday::class.java to TODAY,
    ErekCounter::class.java to COUNTER,
    ErekTasks::class.java to TASKS,
    ErekGoals::class.java to GOALS,
  )

  // The Plus widgets show a lock card on a phone without Plus.
  private fun locked(b: JSONObject, kind: String) = b.optBoolean("locked", false) && kind != TODAY

  private fun items(b: JSONObject, key: String, keep: (JSONObject) -> Boolean = { true }): List<JSONObject> {
    val arr = b.optJSONArray(key) ?: return emptyList()
    val out = ArrayList<JSONObject>()
    for (i in 0 until arr.length()) arr.optJSONObject(i)?.let { if (keep(it)) out.add(it) }
    return out
  }

  fun rows(b: JSONObject?, kind: String): List<Row> {
    if (b == null || locked(b, kind)) return emptyList()
    val day = b.optString("date")
    val stale = b.optBoolean("stale", false)
    val due = { h: JSONObject -> WidgetStore.isDue(h, day) }
    return when (kind) {
      COUNTER -> items(b, "habits") { due(it) && it.optString("kind") == "numeric" }.map { Row("habit", it) }
      TASKS -> if (stale) emptyList() else items(b, "tasks").map { Row("task", it) }
      GOALS -> items(b, "goals").map { Row("goal", it) }
      else -> items(b, "habits", due).map { Row("habit", it) } +
        (if (stale) emptyList() else items(b, "tasks").map { Row("task", it) })
    }
  }

  // — Intents —

  private fun mainComponent(ctx: Context) = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.component

  // Row taps: a broadcast to WidgetReceiver; each row adds its op by fill-in.
  private fun rowTemplate(ctx: Context, widgetId: Int): PendingIntent =
    PendingIntent.getBroadcast(
      ctx, widgetId * 32 + 17,
      Intent(ctx, WidgetReceiver::class.java).setAction(WidgetRender.ACTION),
      PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

  // Row taps that open a screen: a VIEW of the app's own activity; each row adds its uri.
  private fun viewTemplate(ctx: Context, widgetId: Int): PendingIntent {
    val comp = mainComponent(ctx)
    val intent = Intent(Intent.ACTION_VIEW).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    if (comp == null) intent.setPackage(ctx.packageName) else intent.component = comp
    val flags = (if (comp == null) PendingIntent.FLAG_IMMUTABLE else PendingIntent.FLAG_MUTABLE) or PendingIntent.FLAG_UPDATE_CURRENT
    return PendingIntent.getActivity(ctx, widgetId * 32 + 18, intent, flags)
  }

  private fun fill(op: String, key: String? = null, value: String? = null): Intent {
    val i = Intent().putExtra("op", op)
    if (key != null) i.putExtra(key, value)
    return i
  }

  // — Whole widgets —

  fun updateLists(ctx: Context) {
    val mgr = AppWidgetManager.getInstance(ctx)
    for ((cls, kind) in PROVIDERS) {
      val ids = WidgetRender.ids(ctx, cls)
      if (ids.isEmpty()) continue
      for (id in ids) {
        try {
          mgr.updateAppWidget(id, listViews(ctx, id, kind))
        } catch (e: Exception) {
          // a widget failing must not stop the others
        }
      }
      try {
        mgr.notifyAppWidgetViewDataChanged(ids, R.id.l_list)
      } catch (e: Exception) {
      }
    }
    WidgetRender.scheduleMidnight(ctx)
  }

  fun updateQuickAdds(ctx: Context) {
    val mgr = AppWidgetManager.getInstance(ctx)
    for (id in WidgetRender.ids(ctx, ErekQuickAdd::class.java)) {
      try {
        mgr.updateAppWidget(id, quickAddViews(ctx, id))
      } catch (e: Exception) {
      }
    }
  }

  private fun title(b: JSONObject?, kind: String): String {
    val key = when (kind) {
      COUNTER -> "counterTitle"
      TASKS -> "tasksTitle"
      GOALS -> "goalsTitle"
      else -> "todayTitle"
    }
    return WidgetRender.label(b, key, "Erek")
  }

  private fun listViews(ctx: Context, widgetId: Int, kind: String): RemoteViews {
    val b = WidgetStore.boardForToday(ctx)
    val t = WidgetRender.Theme(ctx, b)
    val v = RemoteViews(ctx.packageName, R.layout.erek_widget_list)
    t.tint(v, R.id.l_bg, "bg")
    t.text(v, R.id.l_title, "text")
    t.text(v, R.id.l_summary, "primary")
    v.setTextViewText(R.id.l_title, title(b, kind))
    v.setTextViewText(R.id.l_summary, "")
    v.setViewVisibility(R.id.l_list, View.GONE)
    v.setViewVisibility(R.id.l_empty, View.VISIBLE)
    t.text(v, R.id.l_empty, "muted")
    v.setOnClickPendingIntent(R.id.w_root, WidgetRender.open(ctx, null, widgetId * 32 + 16))

    if (b == null) {
      v.setTextViewText(R.id.l_title, "Erek")
      v.setTextViewText(R.id.l_empty, ctx.getString(R.string.erek_widget_open_app))
      return v
    }
    if (locked(b, kind)) {
      v.setTextViewText(R.id.l_empty, WidgetRender.label(b, "locked"))
      t.text(v, R.id.l_empty, "primary")
      v.setOnClickPendingIntent(R.id.w_root, WidgetRender.open(ctx, WidgetRender.PLUS_URI, widgetId * 32 + 2))
      return v
    }
    val rows = rows(b, kind)
    if (rows.isEmpty()) {
      val stale = b.optBoolean("stale", false) && kind != GOALS
      val emptyKey = when (kind) {
        COUNTER -> "counterEmpty"
        TASKS -> "tasksEmpty"
        GOALS -> "goalsEmpty"
        else -> "todayEmpty"
      }
      v.setTextViewText(R.id.l_empty, WidgetRender.label(b, if (stale) "stale" else emptyKey))
      return v
    }

    summary(b, kind, rows)?.let { v.setTextViewText(R.id.l_summary, it) }
    v.setViewVisibility(R.id.l_empty, View.GONE)
    v.setViewVisibility(R.id.l_list, View.VISIBLE)
    val svc = Intent(ctx, WidgetListService::class.java)
      .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
      .putExtra("kind", kind)
    svc.data = Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME))
    v.setRemoteAdapter(R.id.l_list, svc)
    v.setPendingIntentTemplate(R.id.l_list, if (kind == GOALS) viewTemplate(ctx, widgetId) else rowTemplate(ctx, widgetId))
    return v
  }

  // The header's "3/5": habits and tasks for Bugün, tasks for Görevler.
  private fun summary(b: JSONObject, kind: String, rows: List<Row>): String? {
    if (kind != TODAY && kind != TASKS) return null
    val done = rows.count { it.o.optBoolean("completed", false) }
    return WidgetRender.label(b, "summary", "{done}/{total}")
      .replace("{done}", done.toString())
      .replace("{total}", rows.size.toString())
  }

  // — Rows —

  fun rowViews(ctx: Context, kind: String, row: Row, t: WidgetRender.Theme, b: JSONObject?): RemoteViews {
    val o = row.o
    return when (row.type) {
      "goal" -> goalRow(ctx, o, t)
      "task" -> taskRow(ctx, o, t)
      else -> if (kind == COUNTER) counterRow(ctx, o, t) else habitRow(ctx, o, t)
    }
  }

  private fun amountLabel(h: JSONObject): String {
    val target = h.optDouble("target", 0.0)
    val amount = WidgetRender.num(h.optDouble("amount", 0.0))
    return if (!target.isNaN() && target > 0) "$amount/${WidgetRender.num(target)}" else amount
  }

  private fun habitRow(ctx: Context, h: JSONObject, t: WidgetRender.Theme): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.erek_widget_row_item)
    val done = h.optBoolean("completed", false)
    val kind = h.optString("kind")
    v.setInt(R.id.i_dot, "setColorFilter", WidgetRender.habitColor(h, t.now("primary")))
    v.setTextViewText(R.id.i_title, h.optString("title"))
    t.text(v, R.id.i_title, if (done) "faint" else "text")
    val numeric = kind == "numeric"
    val id = h.optString("id")
    // A timer with a target starts / pauses / resumes right here, like the Timer widget.
    val timer = kind == "timer" && h.optDouble("target", 0.0) > 0
    val active = if (timer) TimerNotifier.loadState(ctx)?.takeIf { it.optString("kind") == "habit" && it.optString("id") == id } else null
    val running = active?.optBoolean("running", false) ?: false
    val trail = when {
      done -> "✓"
      numeric -> "${amountLabel(h)} ＋"
      timer -> if (running) "⏸" else "▶"
      else -> "○"
    }
    v.setTextViewText(R.id.i_trail, trail)
    v.setTextViewTextSize(R.id.i_trail, TypedValue.COMPLEX_UNIT_SP, if (numeric && !done) 13f else 15f)
    t.text(v, R.id.i_trail, if (done) "done" else if (numeric || running) "primary" else "faint")
    v.setOnClickFillInIntent(
      R.id.i_row,
      when {
        kind == "binary" -> fill("row_toggle", "habitId", id)
        numeric -> fill("row_inc", "habitId", id)
        timer -> fill("row_timer", "habitId", id)
        else -> fill("row_open")
      }
    )
    return v
  }

  private fun taskRow(ctx: Context, o: JSONObject, t: WidgetRender.Theme): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.erek_widget_row_item)
    val done = o.optBoolean("completed", false)
    v.setInt(R.id.i_dot, "setColorFilter", WidgetRender.parseColor(o.optString("color"), t.now("primary")))
    v.setTextViewText(R.id.i_title, o.optString("title"))
    t.text(v, R.id.i_title, if (done) "faint" else "text")
    v.setTextViewText(R.id.i_trail, if (done) "✓" else "○")
    v.setTextViewTextSize(R.id.i_trail, TypedValue.COMPLEX_UNIT_SP, 15f)
    t.text(v, R.id.i_trail, if (done) "done" else "faint")
    v.setOnClickFillInIntent(R.id.i_row, fill("row_task", "taskId", o.optString("id")))
    return v
  }

  private fun counterRow(ctx: Context, h: JSONObject, t: WidgetRender.Theme): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.erek_widget_row_counter)
    val done = h.optBoolean("completed", false)
    v.setInt(R.id.c_dot, "setColorFilter", WidgetRender.habitColor(h, t.now("primary")))
    v.setTextViewText(R.id.c_title, h.optString("title"))
    t.text(v, R.id.c_title, "text")
    val unit = h.optString("unit", "")
    v.setTextViewText(R.id.c_amount, if (unit.isNotEmpty()) "${amountLabel(h)} $unit" else amountLabel(h))
    t.text(v, R.id.c_amount, if (done) "done" else "muted")
    t.tint(v, R.id.c_btn_bg, if (done) "done" else "primary")
    t.text(v, R.id.c_btn_text, "onAccent")
    val tap = fill("row_inc", "habitId", h.optString("id"))
    v.setOnClickFillInIntent(R.id.c_btn_bg, tap)
    v.setOnClickFillInIntent(R.id.c_btn_text, tap)
    return v
  }

  private fun goalRow(ctx: Context, g: JSONObject, t: WidgetRender.Theme): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.erek_widget_row_goal)
    val percent = g.optInt("percent", 0).coerceIn(0, 100)
    v.setTextViewText(R.id.g_title, g.optString("title"))
    t.text(v, R.id.g_title, "text")
    v.setTextViewText(R.id.g_percent, g.optString("percentLabel", "$percent%"))
    t.text(v, R.id.g_percent, "primary")
    t.tint(v, R.id.g_track, "border")
    t.tint(v, R.id.g_fill, if (percent >= 100) "done" else "primary")
    v.setInt(R.id.g_fill, "setImageLevel", percent * 100)
    val uri = "habitapp://goal/${Uri.encode(g.optString("id"))}"
    v.setOnClickFillInIntent(R.id.g_row, Intent().setData(Uri.parse(uri)))
    return v
  }

  // — Hızlı görev —

  private fun quickAddViews(ctx: Context, widgetId: Int): RemoteViews {
    val b = WidgetStore.boardForToday(ctx)
    val t = WidgetRender.Theme(ctx, b)
    val v = RemoteViews(ctx.packageName, R.layout.erek_widget_quickadd)
    t.tint(v, R.id.q_bg, "bg")
    t.tint(v, R.id.q_plus_bg, "primary")
    t.text(v, R.id.q_plus, "onAccent")
    v.setContentDescription(R.id.q_root, WidgetRender.label(b, "quickAdd", ctx.getString(R.string.erek_widget_quickadd_text)))
    // Not the app: a small native card over the home screen (QuickAddActivity).
    v.setOnClickPendingIntent(
      R.id.q_root,
      PendingIntent.getActivity(
        ctx, widgetId * 32 + 19,
        Intent(ctx, QuickAddActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
    )
    return v
  }
}
