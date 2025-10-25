package expo.modules.noraview

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.view.View
import android.view.ViewGroup
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class NouController {
  private var noraView: NoraView? = null
  private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

  fun setNoraView(v: NoraView) {
    noraView = v
  }

  fun goBack() {
    val webView = noraView!!.webView
    if (webView.canGoBack()) {
      webView.goBack()
    } else {
      noraView?.currentActivity?.finish()
    }
  }

  fun onMessage(payload: String) {
    noraView?.onMessage(mapOf("payload" to payload))
  }

  fun setFileChooserCallback(callback: ValueCallback<Array<Uri>>) {
    fileChooserCallback = callback
  }

  fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    if (resultCode == Activity.RESULT_OK) {
      fileChooserCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
    } else {
      fileChooserCallback?.onReceiveValue(null)
    }
    fileChooserCallback = null
  }
}

val nouController = NouController()
