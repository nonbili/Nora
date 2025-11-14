package expo.modules.noraview

import android.content.Context
import android.webkit.JavascriptInterface

class NouJsInterface(private val context: Context, private val noraView: NoraView) {
  @JavascriptInterface
  fun onMessage(payload: String) {
    noraView.onMessage(mapOf("payload" to payload))
  }
}
