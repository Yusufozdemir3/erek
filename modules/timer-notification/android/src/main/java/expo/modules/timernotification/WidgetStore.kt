package expo.modules.timernotification

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// The native home-screen widgets' state (Evet/Hayır, Sayaç düğmesi, Zamanlayıcı).
// JS publishes a "board" (habits, today's amounts, the next days they are due,
// theme, labels) whenever data changes; a tap is applied HERE right away and
// queued, and JS later writes the queue into SQLite (consumePending). Nothing
// on the tap path wakes JS, so the widget redraws in milliseconds, app closed or not.
//
// A new day needs no app: the board carries each habit's due days, and a tap
// (or a render) on a later day starts that day from zero.
object WidgetStore {
  private const val PREFS = "erek_widgets"
  private const val KEY_BOARD = "board"
  private const val KEY_PICKS = "picks"
  private const val KEY_PENDING = "pending"
  private const val KEY_LAST_TIMER = "lastTimer"
  private val lock = Any()

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun today(at: Long = System.currentTimeMillis()): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(at))

  // — Board —

  fun board(ctx: Context): JSONObject? = synchronized(lock) {
    val raw = prefs(ctx).getString(KEY_BOARD, null) ?: return null
    try { JSONObject(raw) } catch (e: Exception) { null }
  }

  private fun saveBoard(ctx: Context, b: JSONObject) {
    prefs(ctx).edit().putString(KEY_BOARD, b.toString()).apply()
  }

  // From JS (built from SQLite). Taps JS hasn't consumed yet are laid over it,
  // so a publish racing a tap never shows the old number.
  fun setBoard(ctx: Context, json: String) {
    // Outside our lock: TimerNotifier calls into this object while holding its own.
    val timers = TimerNotifier.peekPending(ctx)
    synchronized(lock) {
      val b = try { JSONObject(json) } catch (e: Exception) { return }
      val pending = readPending(ctx)
      for (i in 0 until pending.length()) applyEntry(b, pending.optJSONObject(i) ?: continue)
      for (i in 0 until timers.length()) applyTimerEntry(b, timers.optJSONObject(i) ?: continue)
      saveBoard(ctx, b)
    }
  }

  // The board as of `day`: an earlier board starts the new day from zero.
  private fun rolled(b: JSONObject, day: String): JSONObject {
    if (b.optString("date") == day) return b
    b.put("date", day)
    // Tasks are today's list: an older board's are not shown (the app refreshes them).
    b.put("stale", true)
    val habits = b.optJSONArray("habits") ?: JSONArray()
    for (i in 0 until habits.length()) {
      val h = habits.optJSONObject(i) ?: continue
      h.put("amount", 0)
      h.put("completed", false)
    }
    return b
  }

  // The board for rendering today (not saved: a render must not write).
  fun boardForToday(ctx: Context): JSONObject? = board(ctx)?.let { rolled(it, today()) }

  fun habit(b: JSONObject, id: String): JSONObject? {
    val habits = b.optJSONArray("habits") ?: return null
    for (i in 0 until habits.length()) {
      val h = habits.optJSONObject(i) ?: continue
      if (h.optString("id") == id) return h
    }
    return null
  }

  fun task(b: JSONObject, id: String): JSONObject? {
    val tasks = b.optJSONArray("tasks") ?: return null
    for (i in 0 until tasks.length()) {
      val t = tasks.optJSONObject(i) ?: continue
      if (t.optString("id") == id) return t
    }
    return null
  }

  fun isDue(h: JSONObject, day: String): Boolean {
    val due = h.optJSONArray("due") ?: return false
    for (i in 0 until due.length()) if (due.optString(i) == day) return true
    return false
  }

  private fun setAmount(h: JSONObject, amount: Double) {
    val v = if (amount < 0) 0.0 else amount
    h.put("amount", v)
    val target = h.optDouble("target", 0.0)
    if (!target.isNaN() && target > 0) h.put("completed", v >= target)
  }

  private fun applyEntry(b: JSONObject, e: JSONObject) {
    if (e.optString("date") != b.optString("date")) return
    if (e.optString("kind") == "task") {
      task(b, e.optString("taskId"))?.put("completed", e.optBoolean("completed"))
      return
    }
    val h = habit(b, e.optString("habitId")) ?: return
    when (e.optString("kind")) {
      "toggle" -> h.put("completed", e.optBoolean("completed"))
      "inc" -> setAmount(h, h.optDouble("amount", 0.0) + e.optDouble("delta", 0.0))
    }
  }

  // A timer stopped natively (pause/finish) booked up to `total` seconds that day.
  private fun applyTimerEntry(b: JSONObject, e: JSONObject) {
    if (e.optString("kind") != "habit" || !e.has("total")) return
    if (e.optString("date") != b.optString("date")) return
    val h = habit(b, e.optString("id")) ?: return
    val total = e.optDouble("total", 0.0)
    if (total > h.optDouble("amount", 0.0)) setAmount(h, total)
  }

  // Native timer stop: the habit's amount for `day` becomes `totalSeconds`.
  fun bookTimer(ctx: Context, habitId: String, day: String, totalSeconds: Double) {
    synchronized(lock) {
      val b = board(ctx) ?: return
      rolled(b, today())
      applyTimerEntry(b, JSONObject().put("kind", "habit").put("id", habitId).put("date", day).put("total", totalSeconds))
      saveBoard(ctx, b)
    }
  }

  // Today's amount of a habit (timer: seconds) as the widgets see it.
  fun amountToday(ctx: Context, habitId: String): Double {
    val b = boardForToday(ctx) ?: return 0.0
    return habit(b, habitId)?.optDouble("amount", 0.0) ?: 0.0
  }

  // — One-habit buttons —

  // A tap on an Evet/Hayır (toggle) or Sayaç (inc) button. Returns false when
  // there is nothing to do (no board, no pick, not due today, wrong kind).
  fun tapHabit(ctx: Context, widgetId: Int, op: String, at: Long): Boolean {
    synchronized(lock) {
      val habitId = pick(ctx, widgetId) ?: return false
      val b = board(ctx) ?: return false
      if (b.optBoolean("locked", false)) return false
      return applyTap(ctx, b, habitId, op, at)
    }
  }

  // A tap on a habit row of a list widget (Bugün, Sayaç); same rules as above.
  fun tapRow(ctx: Context, habitId: String, op: String, at: Long): Boolean {
    synchronized(lock) {
      val b = board(ctx) ?: return false
      return applyTap(ctx, b, habitId, op, at)
    }
  }

  private fun applyTap(ctx: Context, b: JSONObject, habitId: String, op: String, at: Long): Boolean {
    val day = today(at)
    rolled(b, day)
    val h = habit(b, habitId) ?: return false
    if (!isDue(h, day)) return false
    val entry = JSONObject()
      .put("id", newId(at))
      .put("habitId", habitId)
      .put("date", day)
    when {
      op == "toggle" && h.optString("kind") == "binary" ->
        entry.put("kind", "toggle").put("completed", !h.optBoolean("completed", false))
      op == "inc" && h.optString("kind") == "numeric" ->
        entry.put("kind", "inc").put("delta", 1)
      else -> return false
    }
    applyEntry(b, entry)
    saveBoard(ctx, b)
    queue(ctx, entry)
    return true
  }

  // A sentence typed into the Hızlı görev card. The app parses it (date, time, priority)
  // and creates the task when it runs; until then it shows as a plain row on the board.
  fun addTask(ctx: Context, title: String, at: Long) {
    synchronized(lock) {
      val day = today(at)
      val entry = JSONObject()
        .put("id", newId(at))
        .put("kind", "taskAdd")
        .put("title", title)
        .put("date", day)
      val b = board(ctx)
      if (b != null) {
        rolled(b, day)
        if (!b.optBoolean("stale", false)) {
          val tasks = b.optJSONArray("tasks") ?: JSONArray().also { b.put("tasks", it) }
          tasks.put(
            JSONObject().put("id", "add:" + entry.getString("id")).put("title", title).put("color", "").put("completed", false)
          )
          saveBoard(ctx, b)
        }
      }
      queue(ctx, entry)
    }
  }

  // A tap on a task row (Bugün, Görevler): checks it off or back.
  fun tapTask(ctx: Context, taskId: String, at: Long): Boolean {
    synchronized(lock) {
      val b = board(ctx) ?: return false
      val day = today(at)
      rolled(b, day)
      if (b.optBoolean("stale", false)) return false
      val t = task(b, taskId) ?: return false
      val entry = JSONObject()
        .put("id", newId(at))
        .put("kind", "task")
        .put("taskId", taskId)
        .put("date", day)
        .put("completed", !t.optBoolean("completed", false))
      applyEntry(b, entry)
      saveBoard(ctx, b)
      queue(ctx, entry)
      return true
    }
  }

  private fun newId(at: Long) = "n${at.toString(36)}-${(Math.random() * 1e9).toLong().toString(36)}"

  private fun queue(ctx: Context, entry: JSONObject) {
    val pending = readPending(ctx)
    pending.put(entry)
    prefs(ctx).edit().putString(KEY_PENDING, pending.toString()).apply()
  }

  // A tap JS already queued itself (the RN Bugün/Sayaç widgets): show it here
  // too, without queueing it again.
  fun patchHabit(ctx: Context, habitId: String, day: String, completed: Boolean, amount: Double) {
    synchronized(lock) {
      val b = board(ctx) ?: return
      if (b.optString("date") != day) return
      val h = habit(b, habitId) ?: return
      h.put("completed", completed)
      h.put("amount", amount)
      saveBoard(ctx, b)
    }
  }

  private fun readPending(ctx: Context): JSONArray =
    try { JSONArray(prefs(ctx).getString(KEY_PENDING, null) ?: "[]") } catch (e: Exception) { JSONArray() }

  // The queued button taps (a JSON array, oldest first); reading clears them.
  fun consumePending(ctx: Context): String {
    synchronized(lock) {
      val p = prefs(ctx)
      val raw = p.getString(KEY_PENDING, "[]") ?: "[]"
      p.edit().remove(KEY_PENDING).apply()
      return raw
    }
  }

  // — Picks: which habit each placed button widget is about —

  private fun picks(ctx: Context): JSONObject =
    try { JSONObject(prefs(ctx).getString(KEY_PICKS, null) ?: "{}") } catch (e: Exception) { JSONObject() }

  fun pick(ctx: Context, widgetId: Int): String? {
    val v = picks(ctx).optString(widgetId.toString(), "")
    return v.ifEmpty { null }
  }

  fun setPick(ctx: Context, widgetId: Int, habitId: String?) {
    synchronized(lock) {
      val p = picks(ctx)
      if (habitId == null) p.remove(widgetId.toString()) else p.put(widgetId.toString(), habitId)
      prefs(ctx).edit().putString(KEY_PICKS, p.toString()).apply()
    }
  }

  // Picks made with the old (JS) widgets, carried over once. A widget that
  // already has a native pick keeps it.
  fun importPicks(ctx: Context, json: String): Boolean {
    synchronized(lock) {
      val old = try { JSONObject(json) } catch (e: Exception) { return false }
      val p = picks(ctx)
      var changed = false
      for (k in old.keys()) {
        if (!p.has(k) && old.optString(k).isNotEmpty()) {
          p.put(k, old.optString(k))
          changed = true
        }
      }
      if (changed) prefs(ctx).edit().putString(KEY_PICKS, p.toString()).apply()
      return changed
    }
  }

  // — Last timer habit (the idle timer widget offers it) —

  fun lastTimer(ctx: Context): String? = prefs(ctx).getString(KEY_LAST_TIMER, null)

  fun setLastTimer(ctx: Context, habitId: String) {
    prefs(ctx).edit().putString(KEY_LAST_TIMER, habitId).apply()
  }
}
