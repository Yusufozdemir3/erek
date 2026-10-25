package expo.modules.timernotification

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.erek.widget.ErekHabitCount

// The Evet/Hayır and Sayaç düğmesi widgets' configuration screen: which habit
// this widget is about. Native (it opens instantly, without starting JS) and
// drawn from the board in the app's theme. Also opened by tapping a widget
// whose habit is gone.
class HabitPickActivity : Activity() {
  private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

  private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    widgetId = intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
      ?: AppWidgetManager.INVALID_APPWIDGET_ID
    // Backing out leaves the widget unplaced (the launcher's rule).
    setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
    if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
      finish()
      return
    }

    val info = AppWidgetManager.getInstance(this).getAppWidgetInfo(widgetId)
    val kind = if (info?.provider?.className == ErekHabitCount::class.java.name) "numeric" else "binary"
    val b = WidgetStore.board(this)
    val t = WidgetRender.Theme(this, b)
    val labels = b?.optJSONObject("labels")
    fun label(k: String, fallback: String) = labels?.optString(k, "")?.ifEmpty { fallback } ?: fallback

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(t.now("bg"))
      setPadding(dp(20), dp(20), dp(20), dp(12))
    }
    // Edge to edge: keep clear of the status and navigation bars.
    root.setOnApplyWindowInsetsListener { v, insets ->
      val (top, bottom) = barInsets(insets)
      v.setPadding(dp(20), dp(20) + top, dp(20), dp(12) + bottom)
      insets
    }

    root.addView(TextView(this).apply {
      text = label("pickTitle", "Erek")
      textSize = 20f
      setTypeface(typeface, Typeface.BOLD)
      setTextColor(t.now("text"))
      setPadding(0, 0, 0, dp(12))
    })

    val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    val habits = b?.optJSONArray("habits")
    var count = 0
    if (habits != null) {
      for (i in 0 until habits.length()) {
        val h = habits.optJSONObject(i) ?: continue
        if (h.optString("kind") != kind) continue
        count++
        val id = h.optString("id")
        val row = LinearLayout(this).apply {
          orientation = LinearLayout.HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          setPadding(dp(14), dp(14), dp(14), dp(14))
          background = GradientDrawable().apply {
            setColor(t.now("card"))
            setStroke(dp(1), t.now("border"))
            cornerRadius = dp(12).toFloat()
          }
          isClickable = true
          isFocusable = true
          contentDescription = h.optString("title")
          setOnClickListener { choose(id) }
        }
        row.addView(View(this).apply {
          background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(WidgetRender.parseColor(h.optString("color"), t.now("primary")))
          }
        }, LinearLayout.LayoutParams(dp(12), dp(12)).apply { marginEnd = dp(12) })
        row.addView(TextView(this).apply {
          text = h.optString("title")
          textSize = 16f
          setTextColor(t.now("text"))
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        list.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
          bottomMargin = dp(8)
        })
      }
    }
    if (count == 0) {
      list.addView(TextView(this).apply {
        text = if (b == null) getString(R.string.erek_widget_open_app) else label("pickEmpty", "")
        textSize = 14f
        setTextColor(t.now("muted"))
      })
    }
    root.addView(ScrollView(this).apply { addView(list) }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

    root.addView(TextView(this).apply {
      text = label("cancel", "×")
      textSize = 15f
      setTypeface(typeface, Typeface.BOLD)
      setTextColor(t.now("primary"))
      gravity = Gravity.CENTER
      setPadding(dp(14), dp(14), dp(14), dp(14))
      isClickable = true
      setOnClickListener { finish() }
    }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

    setContentView(root)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.insetsController?.setSystemBarsAppearance(
        if (t.night) 0 else WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
      )
    }
  }

  @Suppress("DEPRECATION")
  private fun barInsets(insets: WindowInsets): Pair<Int, Int> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val bars = insets.getInsets(WindowInsets.Type.systemBars())
      bars.top to bars.bottom
    } else {
      insets.systemWindowInsetTop to insets.systemWindowInsetBottom
    }

  private fun choose(habitId: String) {
    WidgetStore.setPick(this, widgetId, habitId)
    WidgetRender.updateButton(this, widgetId)
    setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
    finish()
  }
}
