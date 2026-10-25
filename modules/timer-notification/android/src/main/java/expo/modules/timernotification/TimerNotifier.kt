package expo.modules.timernotification

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import androidx.core.content.ContextCompat
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject

// Zamanlayıcı kartını çizer (uygulamadaki TimerStrip'in aynısı) ve düğmelerini
// uygulamayı AÇMADAN işler: düğmeler TimerActionReceiver'a gider, kart burada
// güncellenir, basış anı kaydedilir. Süreyi veritabanına yazmak JS'in işi;
// JS uygulama bir sonraki açılışında (ya da canlıysa hemen) bu kayıtları
// consumePending ile alıp o anlara göre uygular (süre duvar saatine göre ölçülür,
// o yüzden gecikme süreyi bozmaz).
object TimerNotifier {
  const val ACTION = "expo.modules.timernotification.ACTION"
  private const val CHANNEL_ID = "timer-running"
  const val NOTIFICATION_ID = 7421
  private const val PAUSED_TIMEOUT_MS = 30L * 60 * 1000
  private const val PREFS = "timer_notification"
  private const val KEY_STATE = "state"
  private const val KEY_PENDING = "pending"
  private val lock = Any()

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun clock(totalSeconds: Long): String {
    val s = if (totalSeconds < 0) 0 else totalSeconds
    val h = s / 3600
    val m = (s % 3600) / 60
    val sec = s % 60
    return if (h > 0) String.format("%d:%02d:%02d", h, m, sec) else String.format("%d:%02d", m, sec)
  }

  private fun ensureChannel(ctx: Context, name: String) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = ctx.getSystemService(NotificationManager::class.java) ?: return
    val channel = NotificationChannel(CHANNEL_ID, name, NotificationManager.IMPORTANCE_LOW)
    channel.setSound(null, null)
    channel.enableVibration(false)
    channel.setShowBadge(false)
    channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    manager.createNotificationChannel(channel)
  }

  // Tapping the card body opens the habit / goal (an activity: the app opens).
  private fun openLink(ctx: Context, uri: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
      setPackage(ctx.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return PendingIntent.getActivity(ctx, 1, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  // The buttons: a broadcast, so nothing opens (works with the screen off too).
  private fun button(ctx: Context, op: String, requestCode: Int): PendingIntent {
    val intent = Intent(ctx, TimerActionReceiver::class.java).setAction(ACTION).putExtra("op", op)
    return PendingIntent.getBroadcast(ctx, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun color(o: JSONObject, k: String, fallback: Int): Int =
    try { Color.parseColor(o.optString(k, "")) } catch (e: Exception) { fallback }

  // Draws and posts the card for `o` (elapsedMs counted at `shownAt`) and remembers it.
  // The state is kept even without a card (notify = false: notifications off):
  // the timer widget shows the same timer.
  fun post(ctx: Context, o: JSONObject, shownAt: Long = System.currentTimeMillis()) {
    synchronized(lock) { postLocked(ctx, o, shownAt) }
    WidgetRender.updateTimers(ctx)
  }

  private fun postLocked(ctx: Context, o: JSONObject, shownAt: Long) {
    o.put("shownAt", shownAt)
    if (!o.has("date")) o.put("date", WidgetStore.today(shownAt))
    prefs(ctx).edit().putString(KEY_STATE, o.toString()).apply()
    if (o.optString("kind") == "habit") WidgetStore.setLastTimer(ctx, o.optString("id"))
    render(ctx, o)
  }

  fun loadState(ctx: Context): JSONObject? = synchronized(lock) {
    val raw = prefs(ctx).getString(KEY_STATE, null) ?: return null
    try { JSONObject(raw) } catch (e: Exception) { null }
  }

  // Çalışırken kart foreground service'in; duraklatılmış kart sıradan bildirim.
  private fun render(ctx: Context, o: JSONObject) {
    val manager = ctx.getSystemService(NotificationManager::class.java) ?: return
    val service = TimerForegroundService.instance
    if (!o.optBoolean("notify", true)) {
      service?.release(false)
      manager.cancel(NOTIFICATION_ID)
      return
    }
    if (o.optBoolean("running", false)) {
      var started = false
      try {
        ensureChannel(ctx, o.optString("channelName", ""))
        ContextCompat.startForegroundService(ctx, Intent(ctx, TimerForegroundService::class.java))
        started = true
      } catch (e: Exception) {
        // Arka plandan başlatma reddedildi: sıradan kart.
      }
      if (!started) manager.notify(NOTIFICATION_ID, build(ctx, o))
      else if (service != null) manager.notify(NOTIFICATION_ID, build(ctx, o)) // zaten foreground: yalnız yenile
    } else {
      service?.release(true)
      manager.notify(NOTIFICATION_ID, build(ctx, o))
    }
  }

  fun build(ctx: Context, o: JSONObject): Notification {
    ensureChannel(ctx, o.optString("channelName", ""))
    val running = o.optBoolean("running", false)

    val card = color(o, "card", Color.WHITE)
    val textColor = color(o, "textColor", Color.BLACK)
    val primary = color(o, "primary", Color.parseColor("#4F46E5"))
    val onAccent = color(o, "onAccent", Color.WHITE)
    val accent = color(o, "accent", primary)
    val soft = color(o, "soft", Color.LTGRAY)

    val views = RemoteViews(ctx.packageName, R.layout.timer_notification)
    views.setInt(R.id.timer_border, "setColorFilter", accent)
    views.setInt(R.id.timer_fill, "setColorFilter", card)
    // Same as the app's icon badge: accent ring over a faint (~13%) accent fill.
    views.setInt(R.id.timer_icon_ring, "setColorFilter", accent)
    views.setInt(R.id.timer_icon_fill, "setColorFilter", (accent and 0x00FFFFFF) or 0x22000000)
    views.setInt(R.id.timer_icon_glyph, "setColorFilter", accent)
    views.setTextViewText(R.id.timer_title, o.optString("title", ""))
    views.setTextColor(R.id.timer_title, textColor)

    views.setInt(R.id.timer_button_bg, "setColorFilter", primary)
    views.setTextColor(R.id.timer_button_text, onAccent)
    views.setTextViewText(R.id.timer_button_text, if (running) "❚❚" else "▶")
    views.setContentDescription(R.id.timer_button, o.optString(if (running) "pauseLabel" else "resumeLabel", ""))
    views.setOnClickPendingIntent(R.id.timer_button, button(ctx, if (running) "pause" else "resume", 2))

    views.setInt(R.id.timer_stop_bg, "setColorFilter", soft)
    views.setTextColor(R.id.timer_stop_text, primary)
    views.setContentDescription(R.id.timer_stop, o.optString("finishLabel", ""))
    views.setOnClickPendingIntent(R.id.timer_stop, button(ctx, "finish", 3))

    // Servis yeniden başlatılınca kart, kaydedildiği andan beri geçen süreyle kurulur.
    val sinceShown = if (running) (System.currentTimeMillis() - o.optLong("shownAt", System.currentTimeMillis())).coerceAtLeast(0) else 0L
    val elapsedMs = o.optDouble("elapsedMs", 0.0).toLong() + sinceShown
    val target = o.optString("targetText", "")
    val clockText = clock(elapsedMs / 1000) + if (target.isEmpty()) "" else " / $target"
    val text: String
    if (running) {
      text = o.optString("runningText", "")
      views.setViewVisibility(R.id.timer_chrono, View.VISIBLE)
      views.setViewVisibility(R.id.timer_clock, View.GONE)
      views.setTextColor(R.id.timer_chrono, primary)
      val base = SystemClock.elapsedRealtime() - elapsedMs
      views.setChronometer(R.id.timer_chrono, base, if (target.isEmpty()) "%s" else "%s / $target", true)
    } else {
      text = o.optString("pausedTextTemplate", "{time}").replace("{time}", clock(elapsedMs / 1000))
      views.setViewVisibility(R.id.timer_chrono, View.GONE)
      views.setViewVisibility(R.id.timer_clock, View.VISIBLE)
      views.setTextColor(R.id.timer_clock, textColor)
      views.setTextViewText(R.id.timer_clock, clockText)
    }

    var iconRes = ctx.resources.getIdentifier("ic_timer_notification", "drawable", ctx.packageName)
    if (iconRes == 0) iconRes = ctx.applicationInfo.icon

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(ctx, CHANNEL_ID)
    else Notification.Builder(ctx)
    builder
      .setSmallIcon(iconRes)
      .setColor(primary)
      .setContentTitle(o.optString("title", ""))
      .setContentText(text)
      .setStyle(Notification.DecoratedCustomViewStyle())
      .setCustomContentView(views)
      .setContentIntent(openLink(ctx, o.optString("openUri", "")))
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOnlyAlertOnce(true)
      .setOngoing(running)
      .setAutoCancel(false)
      .setShowWhen(false)
    // A paused timer should not linger for hours.
    if (!running && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) builder.setTimeoutAfter(PAUSED_TIMEOUT_MS)
    return builder.build()
  }

  fun cancel(ctx: Context) {
    synchronized(lock) { clearLocked(ctx) }
    WidgetRender.updateTimers(ctx)
  }

  private fun clearLocked(ctx: Context) {
    prefs(ctx).edit().remove(KEY_STATE).apply()
    TimerForegroundService.instance?.release(false)
    ctx.getSystemService(NotificationManager::class.java)?.cancel(NOTIFICATION_ID)
  }

  // A button press at time `at` (the card's or the timer widget's). Updates the
  // card and the widgets, queues the action for JS. "start" (widget only)
  // starts the habit `targetId`, pausing whatever else runs: one timer at a time.
  fun handle(ctx: Context, op: String, at: Long, targetId: String? = null) {
    synchronized(lock) { handleLocked(ctx, op, at, targetId) }
    WidgetRender.updateTimers(ctx)
  }

  private fun handleLocked(ctx: Context, op: String, at: Long, targetId: String?) {
    val raw = prefs(ctx).getString(KEY_STATE, null)
    val o = raw?.let { try { JSONObject(it) } catch (e: Exception) { null } }
    val running = o?.optBoolean("running", false) ?: false

    if (op == "start") {
      val id = targetId ?: return
      if (o != null && running && o.optString("kind") == "habit" && o.optString("id") == id) return
      // Built before anything changes: an unknown habit must not pause the running one.
      val fresh = WidgetRender.timerStateFor(ctx, id) ?: return
      if (o != null && running) stopLocked(ctx, o, "pause", at, post = false)
      postLocked(ctx, fresh, at)
      queue(ctx, JSONObject().put("op", "resume").put("at", at).put("kind", "habit").put("id", id))
      return
    }
    if (o == null) return
    when {
      op == "pause" && running -> stopLocked(ctx, o, "pause", at, post = true)
      op == "resume" && !running -> {
        o.put("running", true)
        postLocked(ctx, o, at)
        queue(ctx, entry(o, "resume", at))
      }
      op == "finish" -> stopLocked(ctx, o, "finish", at, post = false)
      else -> return // stale button (e.g. a second tap)
    }
  }

  // Pause / finish at `at`. A running habit timer books its total for the day
  // on the widgets right away; JS books it in SQLite from the queue.
  private fun stopLocked(ctx: Context, o: JSONObject, op: String, at: Long, post: Boolean) {
    val running = o.optBoolean("running", false)
    val e = entry(o, op, at)
    if (running) {
      val elapsedMs = o.optDouble("elapsedMs", 0.0).toLong() + (at - o.optLong("shownAt", at)).coerceAtLeast(0)
      val day = o.optString("date", "").ifEmpty { WidgetStore.today(o.optLong("shownAt", at)) }
      e.put("date", day).put("total", elapsedMs / 1000.0)
      if (o.optString("kind") == "habit") WidgetStore.bookTimer(ctx, o.optString("id"), day, elapsedMs / 1000.0)
      o.put("running", false)
      o.put("elapsedMs", elapsedMs.toDouble())
    }
    if (op == "finish") clearLocked(ctx)
    else if (post) postLocked(ctx, o, at)
    else {
      // Replaced right after (start): only remember the frozen state.
      o.put("shownAt", at)
      prefs(ctx).edit().putString(KEY_STATE, o.toString()).apply()
    }
    queue(ctx, e)
  }

  private fun entry(o: JSONObject, op: String, at: Long): JSONObject = JSONObject()
    .put("op", op)
    .put("at", at)
    .put("kind", o.optString("kind", ""))
    .put("id", o.optString("id", ""))

  private fun queue(ctx: Context, e: JSONObject) {
    val pending = try { JSONArray(prefs(ctx).getString(KEY_PENDING, "[]")) } catch (x: Exception) { JSONArray() }
    pending.put(e)
    prefs(ctx).edit().putString(KEY_PENDING, pending.toString()).apply()
  }

  // The queue without clearing it (the widgets lay unbooked stops over a new board).
  fun peekPending(ctx: Context): JSONArray = synchronized(lock) {
    try { JSONArray(prefs(ctx).getString(KEY_PENDING, "[]")) } catch (e: Exception) { JSONArray() }
  }

  // Returns the queued button presses (a JSON array, oldest first) and clears them.
  fun consumePending(ctx: Context): String {
    synchronized(lock) {
      val p = prefs(ctx)
      val raw = p.getString(KEY_PENDING, "[]") ?: "[]"
      p.edit().remove(KEY_PENDING).apply()
      return raw
    }
  }
}
