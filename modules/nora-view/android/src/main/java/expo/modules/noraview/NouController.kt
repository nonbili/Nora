package expo.modules.noraview

import android.app.Activity
import android.content.Context
import android.content.SharedPreferences
import android.content.Intent
import android.net.Uri
import android.os.Handler
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
import org.json.JSONObject
import java.io.File
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
  val askDownloadDestination: Boolean = false

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

  @Field
  val proxyUsername: String = ""

  @Field
  val proxyPassword: String = ""
}

class NoraBlocklist : Record {
  @Field
  val enabled: Boolean = false

  @Field
  val blockedHosts: String = ""

  @Field
  val allowedHosts: String = ""

  @Field
  val cosmeticFilters: String = ""

  @Field
  val cosmeticExceptions: String = ""

  @Field
  val revision: Int = 0
}

typealias LogFn = (String) -> Unit

class NouController {
  internal val downloadPicker = NoraDownloadPicker()
  private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
  internal var settings = NoraSettings()
  internal var i18nStrings = mutableMapOf<String, String>()
  internal var logFn: LogFn? = null
  private var blockingPreferences: SharedPreferences? = null
  private val blockingState = NoraBlockingStateStore()
  @Volatile private var blocklistExcludedHosts = emptySet<String>()
  private val standaloneViews = Collections.newSetFromMap(WeakHashMap<NoraStandaloneActivity, Boolean>())
  private val registeredViews = Collections.newSetFromMap(WeakHashMap<NoraView, Boolean>())

  // Only small settings belong in preferences. The matcher already lives in the
  // file written by lib/blocklist/storage.ts; don't duplicate MBs in preferences.
  @Synchronized fun initializeBlocking(context: Context) {
    if (blockingPreferences != null) return
    val prefs = context.applicationContext.getSharedPreferences("nora.blocking.settings", Context.MODE_PRIVATE)
    blocklistExcludedHosts = decodeBlockingHosts(prefs.getString("excludedHosts", "").orEmpty())
    blockingPreferences = prefs
  }

  /** Run on IO before a standalone page is loaded; React can publish concurrently. */
  internal fun restoreBlocking(context: Context) {
    initializeBlocking(context)
    if (blockingState.initialized) return
    val enabled = blockingPreferences?.getBoolean("enabled", false) ?: false
    val restored = try {
      val file = File(context.filesDir, "blocklist/matcher.json")
      if (enabled && file.exists()) {
        val data = JSONObject(file.readText())
        NoraBlockingState(true, data.optString("blockedHosts"), data.optString("allowedHosts"),
          data.optString("cosmeticFilters"), data.optString("cosmeticExceptions"))
      } else NoraBlockingState()
    } catch (e: Exception) {
      log("standalone blocklist restore failed: ${e.message}")
      NoraBlockingState()
    }
    blockingState.restore(restored)
  }

  fun registerStandalone(view: NoraStandaloneActivity) { standaloneViews.add(view) }
  fun unregisterStandalone(view: NoraStandaloneActivity) { standaloneViews.remove(view) }

  private fun refreshStandaloneScripts() {
    val refresh = { standaloneViews.toList().forEach { it.refreshBlockingScript() } }
    if (Looper.myLooper() == Looper.getMainLooper()) refresh()
    else Handler(Looper.getMainLooper()).post { refresh() }
  }

  internal fun cosmeticCssForHost(host: String): String {
    val snapshot = blockingState.current
    return if (snapshot.enabled && !isBlocklistExcludedHost(host)) snapshot.cosmetics.cssForHost(host) else ""
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
    if (downloadPicker.onActivityResult(requestCode, resultCode, data)) return
    if (requestCode != 0) return
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

  @Synchronized fun setBlocklist(blocklist: NoraBlocklist) {
    blockingState.update(NoraBlockingState(blocklist.enabled, blocklist.blockedHosts, blocklist.allowedHosts,
      blocklist.cosmeticFilters, blocklist.cosmeticExceptions))
    blockingPreferences?.edit()?.putBoolean("enabled", blocklist.enabled)?.apply()
    refreshStandaloneScripts()
  }

  fun register(view: NoraView) {
    registeredViews.add(view)
  }

  fun unregister(view: NoraView) {
    registeredViews.remove(view)
  }

  @Synchronized fun setBlocklistExcludedHosts(hosts: String) {
    blocklistExcludedHosts = decodeBlockingHosts(hosts)
    blockingPreferences?.edit()?.putString("excludedHosts", hosts)?.apply()
    refreshStandaloneScripts()
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

  fun shouldBlockRequestHost(host: String?, pageHost: String?): Boolean =
    !isBlocklistExcludedHost(pageHost) && blockingState.current.shouldBlock(host)
}

val nouController = NouController()
