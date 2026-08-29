package expo.modules.noraview

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Looper
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
import org.json.JSONArray
import java.util.Collections
import java.util.WeakHashMap

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
  private var blocklistExcludedHosts = emptySet<String>()
  internal var blocklistRevision = 0
  private val registeredViews = Collections.newSetFromMap(WeakHashMap<NoraView, Boolean>())

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

  fun register(view: NoraView) {
    registeredViews.add(view)
  }

  fun setBlocklistExcludedHosts(hosts: String) {
    blocklistExcludedHosts = decodeHosts(hosts)
    // Every view has to be carrying the new list before the reload that follows
    // the switch is issued, which is why the exceptions are handed out from here
    // rather than travelling as a prop: a prop lands on React's own schedule.
    // The setter runs on the main queue, so this is done by the time it returns.
    for (view in registeredViews.toList()) {
      if (Looper.myLooper() == Looper.getMainLooper()) {
        view.refreshDocumentStartScript()
      } else {
        view.post { view.refreshDocumentStartScript() }
      }
    }
  }

  /**
   * The snippet handing a page its per-site exceptions before any of its own
   * script runs, so the content script's built-in ad blocking knows to stay out
   * of the way from the first request rather than from the first setting push.
   */
  fun blocklistExclusionsScript(): String {
    return "try{window.__noraBlocklistExcludedHosts=${JSONArray(blocklistExcludedHosts.toList())}}catch(e){}"
  }

  /**
   * Per-site exceptions are keyed by the page host with any `www.` prefix
   * dropped, and cover every subdomain of what is stored.
   */
  fun isBlocklistExcludedHost(host: String?): Boolean {
    if (blocklistExcludedHosts.isEmpty() || host == null) {
      return false
    }

    val normalized = host.lowercase().trimEnd('.').removePrefix("www.")
    if (normalized.isEmpty()) {
      return false
    }

    val parts = normalized.split(".")
    for (index in parts.indices) {
      if (blocklistExcludedHosts.contains(parts.drop(index).joinToString("."))) {
        return true
      }
    }
    return false
  }

  fun shouldBlockRequestHost(host: String?, pageHost: String?): Boolean {
    if (!blocklistEnabled || host == null) {
      return false
    }

    if (isBlocklistExcludedHost(pageHost)) {
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
