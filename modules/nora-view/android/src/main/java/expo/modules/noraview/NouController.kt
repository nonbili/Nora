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
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class NoraSettings : Record {
  @Field
  val openExternalLinkInSystemBrowser: Boolean = false

  @Field
  val redirectToOldReddit: Boolean = false

  @Field
  val allowHttpWebsite: Boolean = false

  @Field
  val internalHosts: List<String> = emptyList()

  @Field
  val proxyEnabled: Boolean = false

  @Field
  val proxyType: String = "http"

  @Field
  val proxyHost: String = ""

  @Field
  val proxyPort: String = ""
}

class NoraBlocklist : Record {
  @Field
  val enabled: Boolean = false

  @Field
  val blockedHosts: String = ""

  @Field
  val allowedHosts: String = ""

  @Field
  val revision: Int = 0
}

typealias LogFn = (String) -> Unit

class NouController {
  private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
  internal var settings = NoraSettings()
  internal var i18nStrings = mutableMapOf<String, String>()
  internal var logFn: LogFn? = null
  private var blocklistEnabled = false
  private var blocklistBlockedHosts = emptySet<String>()
  private var blocklistAllowedHosts = emptySet<String>()
  internal var blocklistRevision = 0

  private fun decodeHosts(value: String): Set<String> {
    if (value.isEmpty()) {
      return emptySet()
    }
    return value
      .lineSequence()
      .map { it.trim() }
      .filter { it.isNotEmpty() }
      .map { it.lowercase() }
      .toSet()
  }

  fun log(msg: String) {
    logFn?.invoke(msg)
  }

  fun t(key: String): String {
    val value = i18nStrings[key]
    if (value != null) {
      return value
    }
    return "Missed translation: $key"
  }

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

  fun setBlocklist(blocklist: NoraBlocklist) {
    blocklistEnabled = blocklist.enabled
    blocklistBlockedHosts = decodeHosts(blocklist.blockedHosts)
    blocklistAllowedHosts = decodeHosts(blocklist.allowedHosts)
    blocklistRevision = blocklist.revision
  }

  fun shouldBlockRequestHost(host: String?): Boolean {
    if (!blocklistEnabled || host == null) {
      return false
    }

    val parts = host.lowercase().split(".")
    var blockIndex = -1
    var allowIndex = -1
    for (index in parts.indices) {
      val candidate = parts.drop(index).joinToString(".")
      if (blockIndex == -1 && blocklistBlockedHosts.contains(candidate)) {
        blockIndex = index
      }
      if (allowIndex == -1 && blocklistAllowedHosts.contains(candidate)) {
        allowIndex = index
      }
    }

    if (blockIndex == -1) {
      return false
    }
    if (allowIndex == -1) {
      return true
    }
    return allowIndex > blockIndex
  }
}

val nouController = NouController()
