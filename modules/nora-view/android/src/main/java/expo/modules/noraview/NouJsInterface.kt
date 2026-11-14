package expo.modules.noraview

import android.content.Context
import android.webkit.JavascriptInterface

class NouJsInterface(private val context: Context, private val noraView: NoraView) {
  @JavascriptInterface
  fun onMessage(payload: String) {
    noraView.onMessage(mapOf("payload" to payload))
  }

  // Called from the page whenever the screen area covered by its scrolled away
  // inner scrollers changes, so pull to refresh can ignore drags that start
  // inside a scrolled feed.
  @JavascriptInterface
  fun setScrolledRegions(rects: String) {
    noraView.setScrolledRegions(rects)
  }

  // Called from the page while it holds a video to speed it up, so sliding to pick
  // a speed can't turn into a pull to refresh.
  @JavascriptInterface
  fun setPullToRefreshSuspended(suspended: Boolean) {
    noraView.setPullToRefreshSuspended(suspended)
  }

  // Called from the page when a long-press starts on an element with its own
  // long-press action (e.g. Facebook reaction picker), so Android's context menu
  // does not open on top of it.
  @JavascriptInterface
  fun setContextMenuSuppressed(suppressed: Boolean) {
    noraView.setContextMenuSuppressed(suppressed)
  }
}
