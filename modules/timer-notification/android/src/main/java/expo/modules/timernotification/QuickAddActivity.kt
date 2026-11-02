package expo.modules.timernotification

import android.app.Activity
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

// The Hızlı görev widget's "+": a small native card with one line to type, over
// whatever is on screen. Nothing of the app starts — the sentence is queued like a
// widget tap and the app turns it into a task (date, time and priority in the
// words included) the next time it runs.
class QuickAddActivity : Activity() {
  private lateinit var input: EditText
  private var board: org.json.JSONObject? = null

  private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

  private fun label(k: String, fallback: String) = WidgetRender.label(board, k, fallback)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    board = WidgetStore.board(this)
    val t = WidgetRender.Theme(this, board)

    val card = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(16), dp(16), dp(16), dp(8))
      background = GradientDrawable().apply {
        setColor(t.now("card"))
        setStroke(dp(1), t.now("border"))
        cornerRadius = dp(20).toFloat()
      }
      // A tap on the card itself must not close the dialog.
      isClickable = true
    }

    input = EditText(this).apply {
      hint = label("quickAddHint", getString(R.string.erek_widget_quickadd_text))
      setHintTextColor(t.now("faint"))
      setTextColor(t.now("text"))
      textSize = 17f
      maxLines = 3
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or InputType.TYPE_TEXT_FLAG_MULTI_LINE
      imeOptions = EditorInfo.IME_ACTION_DONE
      background = null
      setPadding(dp(4), dp(8), dp(4), dp(12))
      setOnEditorActionListener { _, action, _ ->
        if (action == EditorInfo.IME_ACTION_DONE) { submit(); true } else false
      }
    }
    card.addView(input, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

    val buttons = LinearLayout(this).apply { gravity = Gravity.END }
    buttons.addView(button(label("cancel", "×"), t.now("muted")) { finish() })
    buttons.addView(button(label("quickAddSave", "OK"), t.now("primary")) { submit() })
    card.addView(buttons, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

    val root = LinearLayout(this).apply {
      gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
      setPadding(dp(16), dp(72), dp(16), dp(16))
      // A tap outside the card closes it.
      setOnClickListener { finish() }
    }
    root.addView(card, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    setContentView(root)
    input.requestFocus()
  }

  private fun button(text: String, color: Int, onTap: () -> Unit) = TextView(this).apply {
    this.text = text
    textSize = 15f
    setTypeface(typeface, Typeface.BOLD)
    setTextColor(color)
    gravity = Gravity.CENTER
    setPadding(dp(16), dp(12), dp(16), dp(12))
    isClickable = true
    setOnClickListener { onTap() }
  }

  private fun submit() {
    val text = input.text.toString().trim()
    if (text.isEmpty()) return
    WidgetStore.addTask(this, text, System.currentTimeMillis())
    WidgetLists.updateLists(this)
    ErekWidgetsModule.notifyJs()
    Toast.makeText(this, label("quickAddDone", "✓"), Toast.LENGTH_SHORT).show()
    finish()
  }
}
