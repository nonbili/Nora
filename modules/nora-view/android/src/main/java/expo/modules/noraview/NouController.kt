package expo.modules.noraview

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Log
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
  private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

  fun setFileChooserCallback(callback: ValueCallback<Array<Uri>>) {
    fileChooserCallback = callback
  }

  fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    if (resultCode == Activity.RESULT_OK) {
      val clipData = data?.getClipData()
      if (clipData != null) {
        val uris = ArrayList<Uri>()
        for (i in 0 until clipData.itemCount) {
          uris.add(clipData.getItemAt(i).uri)
        }
        fileChooserCallback?.onReceiveValue(uris.toTypedArray())
      } else {
        fileChooserCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
      }
    } else {
      fileChooserCallback?.onReceiveValue(null)
    }
    fileChooserCallback = null
  }
}

val nouController = NouController()
