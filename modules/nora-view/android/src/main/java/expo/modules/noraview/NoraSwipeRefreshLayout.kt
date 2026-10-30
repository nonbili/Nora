package expo.modules.noraview

import android.content.Context
import android.view.MotionEvent
import android.view.ViewConfiguration
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import kotlin.math.abs

/** Whether a drag that has moved this far is a sideways one, which pull to refresh leaves alone. */
internal fun isSidewaysDrag(dx: Float, dy: Float, touchSlop: Int): Boolean =
  abs(dx) > abs(dy) && abs(dx) > touchSlop

// SwipeRefreshLayout takes the touch once a drag goes down past the touch slop, however far it
// has gone sideways. A swipe through an image carousel at the top of a page (X's photo viewer)
// drifts down a little, so the page had its swipe cancelled midway and the carousel stuck.
// Once a drag goes sideways first, the rest of it is left to the page.
internal class NoraSwipeRefreshLayout(context: Context) : SwipeRefreshLayout(context) {
  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private var downX = 0f
  private var downY = 0f
  private var sideways = false

  override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
    when (ev.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downX = ev.x
        downY = ev.y
        sideways = false
      }
      MotionEvent.ACTION_MOVE -> {
        if (!sideways && isSidewaysDrag(ev.x - downX, ev.y - downY, touchSlop)) {
          sideways = true
        }
        if (sideways) return false
      }
    }
    return super.onInterceptTouchEvent(ev)
  }
}
