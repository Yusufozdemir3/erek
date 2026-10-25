package expo.modules.timernotification

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.util.LruCache
import org.json.JSONObject

// Habit icons for the widgets. RemoteViews can't use the app's icon fonts, so
// each glyph is drawn ONCE into a small bitmap from the same Feather/Ionicons
// font files the app uses (copied into the APK's assets by build.gradle) and
// kept in memory; the widget tints it with the habit color. JS sends the glyph's
// code point, so the icon matches the app exactly. An old emoji icon is drawn
// as text in its own colors (not tinted).
object WidgetIcons {
  private const val FONT_DIR = "erek_widget_fonts"
  private val cache = LruCache<String, Bitmap>(48)
  private val faces = HashMap<String, Typeface?>()

  private fun face(ctx: Context, family: String): Typeface? = synchronized(faces) {
    faces.getOrPut(family) {
      val file = when (family) {
        "feather" -> "Feather.ttf"
        "ionicons" -> "Ionicons.ttf"
        else -> return@getOrPut null
      }
      try { Typeface.createFromAsset(ctx.assets, "$FONT_DIR/$file") } catch (e: Exception) { null }
    }
  }

  // spec: {"f": "ionicons" | "feather", "c": code point} or {"e": "💧"}.
  // Returns the bitmap and whether it should be tinted; null = no icon.
  fun get(ctx: Context, spec: JSONObject?, sizeDp: Int): Pair<Bitmap, Boolean>? {
    if (spec == null) return null
    val px = (sizeDp * ctx.resources.displayMetrics.density).toInt().coerceAtLeast(8)
    val emoji = spec.optString("e", "")
    val family = spec.optString("f", "")
    val code = spec.optInt("c", 0)
    val tinted = emoji.isEmpty()
    if (tinted && code == 0) return null
    val key = if (tinted) "$family:$code:$px" else "e:$emoji:$px"
    cache.get(key)?.let { return it to tinted }

    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val text: String
    if (tinted) {
      paint.typeface = face(ctx, family) ?: return null
      paint.color = Color.WHITE
      text = String(Character.toChars(code))
    } else {
      text = emoji
    }
    paint.textSize = px.toFloat()
    val bounds = Rect()
    paint.getTextBounds(text, 0, text.length, bounds)
    // Glyphs differ in size: scale the drawn shape to fit the box.
    val longest = maxOf(bounds.width(), bounds.height()).coerceAtLeast(1)
    if (longest > px) {
      paint.textSize = paint.textSize * px / longest
      paint.getTextBounds(text, 0, text.length, bounds)
    }
    val bmp = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
    val x = (px - bounds.width()) / 2f - bounds.left
    val y = (px - bounds.height()) / 2f - bounds.top
    Canvas(bmp).drawText(text, x, y, paint)
    cache.put(key, bmp)
    return bmp to tinted
  }
}
