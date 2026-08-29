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
}
