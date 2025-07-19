package expo.modules.noraview

import android.content.Context
import android.webkit.JavascriptInterface

class NouJsInterface(private val mContext: Context) {
  @JavascriptInterface
  fun onMessage(payload: String) {
    nouController.onMessage(payload)
  }
}
