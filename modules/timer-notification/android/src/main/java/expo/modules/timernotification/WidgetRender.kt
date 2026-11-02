package expo.modules.timernotification

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.SizeF
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationManagerCompat
import com.erek.widget.ErekHabitCheck
import com.erek.widget.ErekHabitCount
import com.erek.widget.ErekTimer
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

// Draws the native widgets with RemoteViews from WidgetStore's board and the
// timer state (TimerNotifier) — no JS, no bitmaps of the whole widget. Colors
// follow the app theme; with the "system" theme on Android 12+ every color is
// a day/night pair, so the launcher switches it without a redraw.
object WidgetRender {
  const val ACTION = "expo.modules.timernotification.WIDGET"
  // A paused timer stays on the widget as long as its card stays in the shade.
  private const val PAUSED_SHOWN_MS = 30L * 60 * 1000
  private const val WIDE_MIN_WIDTH_DP = 180f
  private const val WIDE_MIN_HEIGHT_DP = 100f
  private const val MAX_ROWS = 3
  private const val TICK_MS = 60_000L
  private const val REQ_TICK = 1
  private const val REQ_MIDNIGHT = 2

  // — Colors —

  private val FALLBACK_LIGHT = mapOf(
    "bg" to "#f8fafc", "card" to "#ffffff", "text" to "#0f172a", "muted" to "#4b5768",
    "faint" to "#64748b", "primary" to "#2f5d45", "soft" to "#dfe9e2", "done" to "#10b981",
    "border" to "#e2e8f0", "track" to "#eef2f7", "onAccent" to "#ffffff",
  )
  private val FALLBACK_DARK = mapOf(
    "bg" to "#161412", "card" to "#211f1c", "text" to "#f4f1ea", "muted" to "#a8a29a",
    "faint" to "#8d867c", "primary" to "#7fb594", "soft" to "#26382d", "done" to "#34d399",
    "border" to "#3a3632", "track" to "#3a3632", "onAccent" to "#ffffff",
  )

  fun parseColor(s: String?, fallback: Int): Int =
    try { if (s.isNullOrEmpty()) fallback else Color.parseColor(s) } catch (e: Exception) { fallback }

  class Theme(ctx: Context, b: JSONObject?) {
    private val mode = b?.optString("mode", "system") ?: "system"
    private val lightPal = b?.optJSONObject("light")
    private val darkPal = b?.optJSONObject("dark")
    private val sysNight =
      (ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    private val dual = mode == "system" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    val night = mode == "dark" || (mode != "light" && sysNight)

    fun day(k: String) = parseColor(lightPal?.optString(k), Color.parseColor(FALLBACK_LIGHT[k] ?: "#000000"))
    fun dark(k: String) = parseColor(darkPal?.optString(k), Color.parseColor(FALLBACK_DARK[k] ?: "#ffffff"))
    fun now(k: String) = if (night) dark(k) else day(k)
    fun hex(k: String) = String.format("#%06X", 0xFFFFFF and now(k))

    fun text(v: RemoteViews, id: Int, k: String) {
      if (dual) v.setColorInt(id, "setTextColor", day(k), dark(k)) else v.setTextColor(id, now(k))
    }

    fun tint(v: RemoteViews, id: Int, k: String) {
      if (dual) v.setColorInt(id, "setColorFilter", day(k), dark(k)) else v.setInt(id, "setColorFilter", now(k))
    }
  }

  internal fun label(b: JSONObject?, k: String, fallback: String = ""): String =
    b?.optJSONObject("labels")?.optString(k, fallback)?.ifEmpty { fallback } ?: fallback

  fun clock(totalSeconds: Double): String {
    val s = if (totalSeconds.isNaN() || totalSeconds < 0) 0L else totalSeconds.toLong()
    val h = s / 3600
    val m = (s % 3600) / 60
    val sec = s % 60
    return if (h > 0) String.format("%d:%02d:%02d", h, m, sec) else String.format("%d:%02d", m, sec)
  }

  internal fun num(v: Double): String =
    if (v.isNaN()) "0" else if (v == Math.floor(v)) v.toLong().toString() else String.format("%.1f", v)

  internal fun habitColor(h: JSONObject?, fallback: Int): Int = parseColor(h?.optString("color"), fallback)

  // — Pending intents —

  private fun broadcast(ctx: Context, op: String, widgetId: Int, slot: Int, habitId: String? = null): PendingIntent {
    val intent = Intent(ctx, WidgetReceiver::class.java)
      .setAction(ACTION)
      .putExtra("op", op)
      .putExtra("widgetId", widgetId)
    if (habitId != null) intent.putExtra("habitId", habitId)
    return PendingIntent.getBroadcast(
      ctx, widgetId * 32 + slot, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
  }

  internal fun open(ctx: Context, uri: String?, requestCode: Int): PendingIntent {
    val intent = if (uri.isNullOrEmpty()) {
      ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: Intent()
    } else {
      Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(ctx.packageName)
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(
      ctx, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
  }

  private fun configure(ctx: Context, widgetId: Int): PendingIntent {
    val intent = Intent(ctx, HabitPickActivity::class.java)
      .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(
      ctx, widgetId * 32 + 31, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
  }

  internal fun habitUri(id: String) = "habitapp://habit/${Uri.encode(id)}"
  internal const val PLUS_URI = "habitapp://plus"
  private const val HABITS_URI = "habitapp://habits"

  // — Updating —

  internal fun ids(ctx: Context, cls: Class<*>): IntArray =
    try { AppWidgetManager.getInstance(ctx).getAppWidgetIds(ComponentName(ctx, cls)) } catch (e: Exception) { IntArray(0) }

  fun updateAll(ctx: Context) {
    updateButtons(ctx)
    updateTimers(ctx)
    WidgetLists.updateLists(ctx)
    WidgetLists.updateQuickAdds(ctx)
  }

  fun updateButtons(ctx: Context) {
    for (id in ids(ctx, ErekHabitCheck::class.java)) updateButton(ctx, id, "binary")
    for (id in ids(ctx, ErekHabitCount::class.java)) updateButton(ctx, id, "numeric")
    scheduleMidnight(ctx)
  }

  fun updateButton(ctx: Context, widgetId: Int) {
    val info = try { AppWidgetManager.getInstance(ctx).getAppWidgetInfo(widgetId) } catch (e: Exception) { null }
    val kind = if (info?.provider?.className == ErekHabitCount::class.java.name) "numeric" else "binary"
    updateButton(ctx, widgetId, kind)
  }

  private fun updateButton(ctx: Context, widgetId: Int, kind: String) {
    try {
      AppWidgetManager.getInstance(ctx).updateAppWidget(widgetId, buttonViews(ctx, widgetId, kind))
    } catch (e: Exception) {
      // a widget failing must not stop the others
    }
  }

  fun updateTimers(ctx: Context) {
    val widgetIds = ids(ctx, ErekTimer::class.java)
    if (widgetIds.isEmpty()) return
    val mgr = AppWidgetManager.getInstance(ctx)
    val model = timerModel(ctx)
    var anyWide = false
    for (id in widgetIds) {
      try {
        val (views, wide) = timerViews(ctx, mgr, id, model)
        anyWide = anyWide || wide
        mgr.updateAppWidget(id, views)
      } catch (e: Exception) {
        // as above
      }
    }
    // The progress bar can't tick on its own like the clock does.
    val a = model.active
    val ticking = anyWide && a != null && a.running && a.targetSec > 0 && a.elapsedMs / 1000.0 < a.targetSec
    scheduleTick(ctx, ticking)
    scheduleMidnight(ctx)
  }

  private fun alarmIntent(ctx: Context, op: String, req: Int): PendingIntent {
    val intent = Intent(ctx, WidgetReceiver::class.java).setAction(ACTION).putExtra("op", op)
    return PendingIntent.getBroadcast(ctx, -req, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun scheduleTick(ctx: Context, on: Boolean) {
    val am = ctx.getSystemService(AlarmManager::class.java) ?: return
    val pi = alarmIntent(ctx, "tick", REQ_TICK)
    if (on) am.set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + TICK_MS, pi) else am.cancel(pi)
  }

  // The next day starts from zero (WidgetStore): redraw at midnight.
  internal fun scheduleMidnight(ctx: Context) {
    val am = ctx.getSystemService(AlarmManager::class.java) ?: return
    val c = Calendar.getInstance()
    c.add(Calendar.DAY_OF_YEAR, 1)
    c.set(Calendar.HOUR_OF_DAY, 0)
    c.set(Calendar.MINUTE, 0)
    c.set(Calendar.SECOND, 5)
    c.set(Calendar.MILLISECOND, 0)
    am.set(AlarmManager.RTC, c.timeInMillis, alarmIntent(ctx, "midnight", REQ_MIDNIGHT))
  }

  // The JS widgets (Bugün, Sayaç) show the same habits. With the app closed
  // nothing else would tell them about a native tap: ask them to redraw (their
  // handler takes the tap from our queue first).
  fun pokeJsWidgets(ctx: Context) {
    if (ErekWidgetsModule.isJsAlive()) return // the app drains and repaints them itself
    val mgr = AppWidgetManager.getInstance(ctx)
    for (name in listOf("ErekCounter", "ErekTasks")) {
      try {
        val cn = ComponentName(ctx.packageName, "${ctx.packageName}.widget.$name")
        val placed = mgr.getAppWidgetIds(cn)
        if (placed.isEmpty()) continue
        ctx.sendBroadcast(
          Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
            .setComponent(cn)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, placed)
        )
      } catch (e: Exception) {
        // best-effort
      }
    }
  }

  // — One-habit buttons —

  private fun buttonViews(ctx: Context, widgetId: Int, kind: String): RemoteViews {
    val b = WidgetStore.boardForToday(ctx)
    val t = Theme(ctx, b)
    val v = RemoteViews(ctx.packageName, R.layout.erek_widget_button)
    v.setViewVisibility(R.id.w_glyph, View.GONE)
    v.setViewVisibility(R.id.w_note, View.GONE)
    v.setViewVisibility(R.id.w_title, View.VISIBLE)
    v.setTextViewTextSize(R.id.w_title, TypedValue.COMPLEX_UNIT_SP, 12f)
    t.tint(v, R.id.w_bg, "card")

    // A card with a short note; tapping it opens `click`.
    fun note(title: String?, text: String, click: PendingIntent, textKey: String = "muted") {
      if (title.isNullOrEmpty()) v.setViewVisibility(R.id.w_title, View.GONE)
      else {
        v.setTextViewText(R.id.w_title, title)
        v.setTextViewTextSize(R.id.w_title, TypedValue.COMPLEX_UNIT_SP, 13f)
        t.text(v, R.id.w_title, "text")
      }
      v.setViewVisibility(R.id.w_note, View.VISIBLE)
      v.setTextViewText(R.id.w_note, text)
      t.text(v, R.id.w_note, textKey)
      v.setOnClickPendingIntent(R.id.w_root, click)
    }

    if (b == null) {
      note("Erek", ctx.getString(R.string.erek_widget_open_app), open(ctx, null, widgetId * 32 + 1))
      return v
    }
    if (b.optBoolean("locked", false)) {
      t.tint(v, R.id.w_bg, "bg")
      note("Erek", label(b, "locked"), open(ctx, PLUS_URI, widgetId * 32 + 2), "primary")
      v.setTextViewTextSize(R.id.w_title, TypedValue.COMPLEX_UNIT_SP, 16f)
      return v
    }
    val habitId = WidgetStore.pick(ctx, widgetId)
    val h = habitId?.let { WidgetStore.habit(b, it) }?.takeIf { it.optString("kind") == kind }
    if (h == null) {
      note(null, label(b, "pick"), configure(ctx, widgetId))
      return v
    }
    if (!WidgetStore.isDue(h, b.optString("date"))) {
      note(h.optString("title"), label(b, "notToday"), open(ctx, habitUri(h.optString("id")), widgetId * 32 + 3))
      return v
    }

    val numeric = kind == "numeric"
    val done = h.optBoolean("completed", false)
    val target = h.optDouble("target", 0.0)
    val amount = h.optDouble("amount", 0.0)
    val count = if (!target.isNaN() && target > 0) "${num(amount)}/${num(target)}" else num(amount)
    val glyph = if (numeric) (if (done) count else "$count ＋") else if (done) "✓" else "○"
    t.tint(v, R.id.w_bg, if (done) "done" else "card")
    v.setViewVisibility(R.id.w_glyph, View.VISIBLE)
    v.setTextViewText(R.id.w_glyph, glyph)
    if (done) t.text(v, R.id.w_glyph, "onAccent") else v.setTextColor(R.id.w_glyph, habitColor(h, t.now("primary")))
    v.setTextViewText(R.id.w_title, h.optString("title"))
    t.text(v, R.id.w_title, if (done) "onAccent" else "text")
    v.setOnClickPendingIntent(R.id.w_root, broadcast(ctx, if (numeric) "inc" else "toggle", widgetId, 0))
    return v
  }

  // — Timer —

  class Active(
    val kind: String,
    val id: String,
    val title: String,
    val accent: Int?,
    val icon: JSONObject?,
    val running: Boolean,
    val elapsedMs: Long, // now
    val targetSec: Double,
  )

  class TimerModel(
    val board: JSONObject?,
    val theme: Theme,
    val active: Active?,
    val habits: List<JSONObject>, // today's timer habits, app order
    val candidate: JSONObject?, // the idle widget's habit: the last one used, else the first
  )

  private fun timerModel(ctx: Context): TimerModel {
    val b = WidgetStore.boardForToday(ctx)
    val theme = Theme(ctx, b)
    val today = WidgetStore.today()
    val habits = ArrayList<JSONObject>()
    val arr = b?.optJSONArray("habits") ?: JSONArray()
    for (i in 0 until arr.length()) {
      val h = arr.optJSONObject(i) ?: continue
      if (h.optString("kind") == "timer" && h.optDouble("target", 0.0) > 0 && WidgetStore.isDue(h, today)) habits.add(h)
    }
    val active = activeTimer(ctx, b, today)
    val last = WidgetStore.lastTimer(ctx)
    val candidate = habits.firstOrNull { it.optString("id") == last } ?: habits.firstOrNull()
    return TimerModel(b, theme, active, habits, candidate)
  }

  private fun activeTimer(ctx: Context, b: JSONObject?, today: String): Active? {
    val o = TimerNotifier.loadState(ctx) ?: return null
    val now = System.currentTimeMillis()
    val running = o.optBoolean("running", false)
    val shownAt = o.optLong("shownAt", now)
    if (!running) {
      if (now - shownAt > PAUSED_SHOWN_MS) return null
      val day = o.optString("date", "")
      if (day.isNotEmpty() && day != today) return null
    }
    val kind = o.optString("kind", "")
    val id = o.optString("id", "")
    val h = if (kind == "habit" && b != null) WidgetStore.habit(b, id) else null
    val elapsed = o.optDouble("elapsedMs", 0.0).toLong() + if (running) (now - shownAt).coerceAtLeast(0) else 0L
    val target = o.optDouble("targetSeconds", h?.optDouble("target", 0.0) ?: 0.0).let { if (it.isNaN()) 0.0 else it }
    val accent = o.optString("accent", "").let { if (it.isEmpty()) null else parseColor(it, Color.GRAY) }
    val icon = h?.optJSONObject("icon") ?: if (kind == "goal") b?.optJSONObject("goalIcon") else null
    return Active(kind, id, o.optString("title", h?.optString("title") ?: ""), accent, icon, running, elapsed, target)
  }

  private fun activeUri(a: Active) = "habitapp://${a.kind}/${Uri.encode(a.id)}"

  // One RemoteViews per size the launcher may show (Android 12+), else one for
  // the portrait size. Returns whether any of them is the wide face.
  private fun timerViews(ctx: Context, mgr: AppWidgetManager, widgetId: Int, m: TimerModel): Pair<RemoteViews, Boolean> {
    val opts: Bundle = mgr.getAppWidgetOptions(widgetId)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      @Suppress("DEPRECATION")
      val sizes = opts.getParcelableArrayList<SizeF>(AppWidgetManager.OPTION_APPWIDGET_SIZES)
      if (!sizes.isNullOrEmpty()) {
        var wide = false
        val map = LinkedHashMap<SizeF, RemoteViews>()
        for (s in sizes.take(16)) {
          val isWide = s.width >= WIDE_MIN_WIDTH_DP && s.height >= WIDE_MIN_HEIGHT_DP
          wide = wide || isWide
          map[s] = if (isWide) wideTimer(ctx, widgetId, m, s.height) else smallTimer(ctx, widgetId, m)
        }
        return RemoteViews(map) to wide
      }
    }
    val w = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0).toFloat()
    val h = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0).toFloat()
    val isWide = w >= WIDE_MIN_WIDTH_DP && h >= WIDE_MIN_HEIGHT_DP
    return (if (isWide) wideTimer(ctx, widgetId, m, h) else smallTimer(ctx, widgetId, m)) to isWide
  }

  private fun round(v: RemoteViews, t: Theme, bg: Int, text: Int, primary: Boolean) {
    t.tint(v, bg, if (primary) "primary" else "soft")
    t.text(v, text, if (primary) "onAccent" else "primary")
  }

  private fun smallTimer(ctx: Context, widgetId: Int, m: TimerModel): RemoteViews {
    val b = m.board
    val t = m.theme
    val v = RemoteViews(ctx.packageName, R.layout.erek_widget_timer_small)
    t.tint(v, R.id.t_fill, "card")
    t.tint(v, R.id.t_border, "border")
    t.text(v, R.id.t_title, "text")
    v.setViewVisibility(R.id.t_chrono, View.GONE)
    v.setViewVisibility(R.id.t_clock, View.VISIBLE)
    v.setViewVisibility(R.id.t_stop, View.GONE)
    v.setViewVisibility(R.id.t_main, View.GONE)
    v.setTextViewTextSize(R.id.t_clock, TypedValue.COMPLEX_UNIT_SP, 12f)
    round(v, t, R.id.t_stop_bg, R.id.t_stop_text, false)
    round(v, t, R.id.t_main_bg, R.id.t_main_text, true)

    fun message(title: String, text: String, click: PendingIntent, key: String = "muted") {
      v.setTextViewText(R.id.t_title, title)
      v.setTextViewText(R.id.t_clock, text)
      t.text(v, R.id.t_clock, key)
      v.setOnClickPendingIntent(R.id.t_root, click)
    }

    if (b == null) {
      message("Erek", ctx.getString(R.string.erek_widget_open_app), open(ctx, null, widgetId * 32 + 1))
      return v
    }
    if (b.optBoolean("locked", false)) {
      message(label(b, "timersTitle", "Erek"), label(b, "locked"), open(ctx, PLUS_URI, widgetId * 32 + 2), "primary")
      return v
    }
    val a = m.active
    if (a != null) {
      a.accent?.let { v.setInt(R.id.t_border, "setColorFilter", it) }
      v.setTextViewText(R.id.t_title, a.title)
      v.setOnClickPendingIntent(R.id.t_body, open(ctx, activeUri(a), widgetId * 32 + 4))
      v.setViewVisibility(R.id.t_stop, View.VISIBLE)
      v.setViewVisibility(R.id.t_main, View.VISIBLE)
      v.setOnClickPendingIntent(R.id.t_stop, broadcast(ctx, "finish", widgetId, 5))
      v.setContentDescription(R.id.t_stop, label(b, "finish"))
      if (a.running) {
        v.setViewVisibility(R.id.t_clock, View.GONE)
        v.setViewVisibility(R.id.t_chrono, View.VISIBLE)
        t.text(v, R.id.t_chrono, "primary")
        v.setChronometer(R.id.t_chrono, SystemClock.elapsedRealtime() - a.elapsedMs, "%s", true)
        v.setTextViewText(R.id.t_main_text, "❚❚")
        v.setContentDescription(R.id.t_main, label(b, "pause"))
        v.setOnClickPendingIntent(R.id.t_main, broadcast(ctx, "pause", widgetId, 6))
      } else {
        v.setTextViewTextSize(R.id.t_clock, TypedValue.COMPLEX_UNIT_SP, 17f)
        v.setTextViewText(R.id.t_clock, clock(a.elapsedMs / 1000.0))
        t.text(v, R.id.t_clock, "faint")
        v.setTextViewText(R.id.t_main_text, "▶")
        v.setContentDescription(R.id.t_main, label(b, "resume"))
        v.setOnClickPendingIntent(R.id.t_main, broadcast(ctx, "resume", widgetId, 6))
      }
      return v
    }
    val c = m.candidate
    if (c == null) {
      message(label(b, "timersTitle", "Erek"), label(b, "noTimers"), open(ctx, HABITS_URI, widgetId * 32 + 7))
      return v
    }
    val id = c.optString("id")
    v.setInt(R.id.t_border, "setColorFilter", habitColor(c, t.now("primary")))
    v.setTextViewText(R.id.t_title, c.optString("title"))
    val time = "${clock(c.optDouble("amount", 0.0))} / ${clock(c.optDouble("target", 0.0))}"
    v.setTextViewText(R.id.t_clock, label(b, "today", "{time}").replace("{time}", time))
    t.text(v, R.id.t_clock, "muted")
    v.setOnClickPendingIntent(R.id.t_body, open(ctx, habitUri(id), widgetId * 32 + 4))
    v.setViewVisibility(R.id.t_main, View.VISIBLE)
    v.setTextViewText(R.id.t_main_text, "▶")
    v.setContentDescription(R.id.t_main, label(b, "start"))
    v.setOnClickPendingIntent(R.id.t_main, broadcast(ctx, "start", widgetId, 6, id))
    return v
  }

  private val ROWS = arrayOf(
    intArrayOf(R.id.r0, R.id.r0_body, R.id.r0_fill, R.id.r0_ring, R.id.r0_glyph, R.id.r0_title, R.id.r0_time, R.id.r0_play, R.id.r0_play_bg, R.id.r0_play_text),
    intArrayOf(R.id.r1, R.id.r1_body, R.id.r1_fill, R.id.r1_ring, R.id.r1_glyph, R.id.r1_title, R.id.r1_time, R.id.r1_play, R.id.r1_play_bg, R.id.r1_play_text),
    intArrayOf(R.id.r2, R.id.r2_body, R.id.r2_fill, R.id.r2_ring, R.id.r2_glyph, R.id.r2_title, R.id.r2_time, R.id.r2_play, R.id.r2_play_bg, R.id.r2_play_text),
  )

  // The app's icon badge: accent ring over a faint (~13%) accent fill, tinted glyph.
  private fun badge(ctx: Context, v: RemoteViews, fill: Int, ring: Int, glyph: Int, accent: Int, icon: JSONObject?, sizeDp: Int) {
    v.setInt(fill, "setColorFilter", (accent and 0x00FFFFFF) or 0x22000000)
    v.setInt(ring, "setColorFilter", accent)
    val bmp = WidgetIcons.get(ctx, icon, sizeDp)
    if (bmp == null) {
      v.setViewVisibility(glyph, View.GONE)
      return
    }
    v.setViewVisibility(glyph, View.VISIBLE)
    v.setImageViewBitmap(glyph, bmp.first)
    v.setInt(glyph, "setColorFilter", if (bmp.second) accent else 0)
  }

  private fun wideTimer(ctx: Context, widgetId: Int, m: TimerModel, heightDp: Float): RemoteViews {
    val b = m.board
    val t = m.theme
    val v = RemoteViews(ctx.packageName, R.layout.erek_widget_timer_wide)
    t.tint(v, R.id.w_fill, "card")
    t.tint(v, R.id.w_border, "border")
    t.text(v, R.id.h_title, "text")
    t.text(v, R.id.h_total, "muted")
    t.text(v, R.id.w_more, "primary")
    t.text(v, R.id.w_empty, "muted")
    v.setViewVisibility(R.id.a_block, View.GONE)
    v.setViewVisibility(R.id.h_block, View.VISIBLE)
    v.setViewVisibility(R.id.w_more, View.GONE)
    v.setViewVisibility(R.id.w_empty, View.GONE)
    for (r in ROWS) v.setViewVisibility(r[0], View.GONE)

    fun message(text: String, click: PendingIntent, key: String = "muted") {
      v.setTextViewText(R.id.h_title, label(b, "timersTitle", "Erek"))
      v.setTextViewText(R.id.h_total, "")
      v.setViewVisibility(R.id.w_empty, View.VISIBLE)
      v.setTextViewText(R.id.w_empty, text)
      t.text(v, R.id.w_empty, key)
      v.setOnClickPendingIntent(R.id.w_root, click)
    }

    if (b == null) {
      message(ctx.getString(R.string.erek_widget_open_app), open(ctx, null, widgetId * 32 + 1))
      return v
    }
    if (b.optBoolean("locked", false)) {
      message(label(b, "locked"), open(ctx, PLUS_URI, widgetId * 32 + 2), "primary")
      return v
    }

    val a = m.active
    // Fixed heights (dp) the layout uses: padding, the two headers, a row, "+N".
    var room = heightDp - 18f
    if (a != null) {
      room -= 82f
      val accent = a.accent ?: t.now("primary")
      v.setInt(R.id.w_border, "setColorFilter", accent)
      v.setViewVisibility(R.id.a_block, View.VISIBLE)
      v.setViewVisibility(R.id.h_block, View.GONE)
      badge(ctx, v, R.id.a_fill, R.id.a_ring, R.id.a_glyph, accent, a.icon, 14)
      v.setTextViewText(R.id.a_title, a.title)
      t.text(v, R.id.a_title, "text")
      v.setOnClickPendingIntent(R.id.a_body, open(ctx, activeUri(a), widgetId * 32 + 4))
      round(v, t, R.id.a_stop_bg, R.id.a_stop_text, false)
      round(v, t, R.id.a_main_bg, R.id.a_main_text, true)
      v.setOnClickPendingIntent(R.id.a_stop, broadcast(ctx, "finish", widgetId, 5))
      v.setContentDescription(R.id.a_stop, label(b, "finish"))
      if (a.targetSec > 0) {
        v.setViewVisibility(R.id.a_target, View.VISIBLE)
        v.setTextViewText(R.id.a_target, "/ ${clock(a.targetSec)}")
        t.text(v, R.id.a_target, "muted")
        v.setViewVisibility(R.id.a_bar, View.VISIBLE)
        t.tint(v, R.id.a_track, "track")
        val reached = a.elapsedMs / 1000.0 >= a.targetSec
        t.tint(v, R.id.a_progress, if (reached) "done" else "primary")
        val level = ((a.elapsedMs / 1000.0 / a.targetSec).coerceIn(0.0, 1.0) * 10000).toInt()
        v.setInt(R.id.a_progress, "setImageLevel", level)
      } else {
        v.setViewVisibility(R.id.a_target, View.GONE)
        v.setViewVisibility(R.id.a_bar, View.GONE)
      }
      if (a.running) {
        v.setViewVisibility(R.id.a_clock, View.GONE)
        v.setViewVisibility(R.id.a_chrono, View.VISIBLE)
        t.text(v, R.id.a_chrono, "primary")
        v.setChronometer(R.id.a_chrono, SystemClock.elapsedRealtime() - a.elapsedMs, "%s", true)
        v.setTextViewText(R.id.a_main_text, "❚❚")
        v.setContentDescription(R.id.a_main, label(b, "pause"))
        v.setOnClickPendingIntent(R.id.a_main, broadcast(ctx, "pause", widgetId, 6))
      } else {
        v.setViewVisibility(R.id.a_chrono, View.GONE)
        v.setViewVisibility(R.id.a_clock, View.VISIBLE)
        v.setTextViewText(R.id.a_clock, clock(a.elapsedMs / 1000.0))
        t.text(v, R.id.a_clock, "faint")
        v.setTextViewText(R.id.a_main_text, "▶")
        v.setContentDescription(R.id.a_main, label(b, "resume"))
        v.setOnClickPendingIntent(R.id.a_main, broadcast(ctx, "resume", widgetId, 6))
      }
    } else {
      room -= 24f
      var total = 0.0
      for (h in m.habits) total += h.optDouble("amount", 0.0)
      v.setTextViewText(R.id.h_title, label(b, "timersTitle", "Erek"))
      val minutes = label(b, "minutes", "{n}").replace("{n}", Math.round(total / 60).toString())
      v.setTextViewText(R.id.h_total, label(b, "today", "{time}").replace("{time}", minutes))
      v.setOnClickPendingIntent(R.id.h_block, open(ctx, HABITS_URI, widgetId * 32 + 7))
    }

    val others = m.habits.filter { a == null || a.kind != "habit" || it.optString("id") != a.id }
    if (others.isEmpty()) {
      if (a == null) {
        v.setViewVisibility(R.id.w_empty, View.VISIBLE)
        v.setTextViewText(R.id.w_empty, label(b, "noTimers"))
        v.setOnClickPendingIntent(R.id.w_empty, open(ctx, HABITS_URI, widgetId * 32 + 7))
      }
      return v
    }
    val rowDp = 34f
    var shown = (room / rowDp).toInt().coerceIn(0, MAX_ROWS)
    if (others.size > shown) shown = ((room - 18f) / rowDp).toInt().coerceIn(0, MAX_ROWS)
    for (i in 0 until minOf(shown, others.size)) {
      val r = ROWS[i]
      val h = others[i]
      val id = h.optString("id")
      val accent = habitColor(h, t.now("primary"))
      v.setViewVisibility(r[0], View.VISIBLE)
      badge(ctx, v, r[2], r[3], r[4], accent, h.optJSONObject("icon"), 12)
      v.setTextViewText(r[5], h.optString("title"))
      t.text(v, r[5], "text")
      v.setTextViewText(r[6], "${clock(h.optDouble("amount", 0.0))} / ${clock(h.optDouble("target", 0.0))}")
      t.text(v, r[6], if (h.optBoolean("completed", false)) "done" else "muted")
      v.setOnClickPendingIntent(r[1], open(ctx, habitUri(id), widgetId * 32 + 8 + i))
      round(v, t, r[8], r[9], false)
      v.setContentDescription(r[7], label(b, "start"))
      v.setOnClickPendingIntent(r[7], broadcast(ctx, "start", widgetId, 12 + i, id))
    }
    val rest = others.size - minOf(shown, others.size)
    if (rest > 0 && room - shown * rowDp >= 16f) {
      v.setViewVisibility(R.id.w_more, View.VISIBLE)
      v.setTextViewText(R.id.w_more, label(b, "more", "+{n}").replace("{n}", rest.toString()))
      v.setOnClickPendingIntent(R.id.w_more, open(ctx, HABITS_URI, widgetId * 32 + 7))
    }
    return v
  }

  // — Starting a timer from the widget —

  // The timer card (TimerNotifier) for habit `habitId` as of now: the same
  // fields JS sends, from the board. null if it isn't a timer habit we know.
  fun timerStateFor(ctx: Context, habitId: String): JSONObject? {
    val b = WidgetStore.boardForToday(ctx) ?: return null
    if (b.optBoolean("locked", false)) return null
    val h = WidgetStore.habit(b, habitId) ?: return null
    val target = h.optDouble("target", 0.0)
    if (h.optString("kind") != "timer" || target.isNaN() || target <= 0) return null
    val t = Theme(ctx, b)
    val notify = b.optBoolean("notify", false) && NotificationManagerCompat.from(ctx).areNotificationsEnabled()
    return JSONObject()
      .put("channelName", label(b, "channelName"))
      .put("title", h.optString("title"))
      .put("kind", "habit")
      .put("id", habitId)
      .put("running", true)
      .put("elapsedMs", h.optDouble("amount", 0.0) * 1000)
      .put("targetText", clock(target))
      .put("targetSeconds", target)
      .put("runningText", label(b, "running"))
      .put("pausedTextTemplate", label(b, "pausedTemplate", "{time}"))
      .put("pauseLabel", label(b, "pause"))
      .put("resumeLabel", label(b, "resume"))
      .put("finishLabel", label(b, "finish"))
      .put("openUri", habitUri(habitId))
      .put("card", t.hex("card"))
      .put("textColor", t.hex("text"))
      .put("primary", t.hex("primary"))
      .put("soft", t.hex("soft"))
      .put("onAccent", t.hex("onAccent"))
      .put("accent", h.optString("color", t.hex("primary")))
      .put("notify", notify)
      .put("date", WidgetStore.today())
  }
}
