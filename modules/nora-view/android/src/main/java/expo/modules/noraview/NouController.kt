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
  private var activity: Activity? = null
  private var noraView: NoraView? = null
  private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

  fun setActivity(v: Activity) {
    activity = v
  }

  fun setNoraView(v: NoraView) {
    noraView = v
  }

  fun goBack() {
    val webView = noraView!!.webView
    if (webView.canGoBack()) {
      webView.goBack()
    } else {
      activity?.finish()
    }
  }

  fun onMessage(payload: String) {
    noraView?.onMessage(mapOf("payload" to payload))
  }

  fun showFullscreen(view: View) {
    val window = activity!!.window
    (window.decorView as FrameLayout).addView(
      view,
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    )
    // activity!!.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE)

    // https://stackoverflow.com/a/64828067
    // WindowCompat.setDecorFitsSystemWindows(window, false)
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    controller.hide(WindowInsetsCompat.Type.systemBars())
    controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
  }

  fun exitFullscreen(view: View) {
    val window = activity!!.window
    (window.decorView as FrameLayout).removeView(view)
    // activity!!.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER)

    // WindowCompat.setDecorFitsSystemWindows(window, true)
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    controller.show(WindowInsetsCompat.Type.systemBars())
  }

  fun onShowFileChooser(
    view: WebView,
    callback: ValueCallback<Array<Uri>>,
    params: WebChromeClient.FileChooserParams
  ): Boolean {
    // https://stackoverflow.com/a/62625964
    fileChooserCallback = callback
    val intent = params.createIntent()
    activity!!.startActivityForResult(intent, 0)
    return true
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
