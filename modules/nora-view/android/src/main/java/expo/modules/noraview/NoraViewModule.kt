package expo.modules.noraview

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.CookieManager
import android.webkit.WebStorage
import android.webkit.WebView
import android.widget.Toast
import androidx.webkit.ProfileStore
import androidx.webkit.ProxyConfig
import androidx.webkit.ProxyController
import androidx.webkit.WebViewFeature
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.jni.JavaScriptObject
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.io.FileWriter

class NoraViewModule : Module() {
  fun log(msg: String) {
    sendEvent("log", mapOf("msg" to msg))
  }

  private var lastProxyKey: String? = null

  // "www.example.com" -> www.example.com, .www.example.com, example.com,
  // .example.com. Stops at two labels so we never walk up to a bare TLD, and
  // leaves IP literals alone.
  private fun cookieDomains(host: String): List<String> {
    val labelList = host.split(".")
    // IPv6 literal, or an IPv4 address whose labels must not be stripped.
    if (host.contains(":") || labelList.all { it.toIntOrNull() != null }) {
      return listOf(host)
    }

    val domains = mutableListOf<String>()
    var current = host
    while (true) {
      domains.add(current)
      domains.add(".$current")
      val labels = current.split(".")
      if (labels.size <= 2) break
      current = labels.drop(1).joinToString(".")
    }
    return domains
  }

  private fun applyProxy(settings: NoraSettings) {
    if (WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
      val proxyKey = "${settings.proxyEnabled}|${settings.proxyType}|${settings.proxyHost}|${settings.proxyPort}"
      if (proxyKey == lastProxyKey) {
        return
      }
      lastProxyKey = proxyKey
      val executor = java.util.concurrent.Executor { command -> command.run() }
      if (settings.proxyEnabled && settings.proxyHost.isNotEmpty()) {
        val type = if (settings.proxyType == "socks") "socks" else "http"
        val portStr = if (settings.proxyPort.isNotEmpty()) ":${settings.proxyPort}" else ""
        val proxyRule = "$type://${settings.proxyHost}$portStr"
        val proxyConfig = ProxyConfig.Builder()
          .addProxyRule(proxyRule)
          .build()
        try {
          ProxyController.getInstance().setProxyOverride(proxyConfig, executor, Runnable {
            log("proxy override applied: $proxyRule")
          })
        } catch (e: Exception) {
          log("setProxyOverride failed: ${e.message}")
        }
      } else {
        try {
          ProxyController.getInstance().clearProxyOverride(executor, Runnable {
            log("proxy override cleared")
          })
        } catch (e: Exception) {
          log("clearProxyOverride failed: ${e.message}")
        }
      }
    }
  }

  init {
    nouController.logFn = this::log
  }

  private var clipText = ""

  private val clipboardManager: ClipboardManager?
    get() = appContext.reactContext?.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager

  private val listener = ClipboardManager.OnPrimaryClipChangedListener {
    clipboardManager?.primaryClip?.let { clip ->
      if (clip.itemCount == 0) {
        return@let
      }
      val item = clip.getItemAt(0)
      val text = item.text?.toString() ?: return@let
      if (clipText == text) {
        return@let
      }
      val uri = Uri.parse(text)
      if (uri.host in VIEW_HOSTS) {
        val cleanUrl = removeTrackingParams(text)
        if (cleanUrl != text) {
          clipText = cleanUrl
          val clipData = ClipData.newPlainText("", clipText)
          clipboardManager?.setPrimaryClip(clipData)
        }
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("NoraView")

    OnActivityResult { activity, payload ->
      nouController.onActivityResult(payload.requestCode, payload.resultCode, payload.data)
    }

    Events("log")

    OnStartObserving {
      clipboardManager?.addPrimaryClipChangedListener(listener)
    }

    OnStopObserving {
      clipboardManager?.removePrimaryClipChangedListener(listener)
    }

    Function("setSettings") { settings: NoraSettings ->
      nouController.settings = settings
      applyProxy(settings)
    }

    // On the main queue, and awaited by the caller: the per-site switch reloads
    // the page as soon as this resolves, and the reload must not outrun the
    // document start script the new exceptions are reinstalled into.
    AsyncFunction("setBlocklistExcludedHosts") { hosts: String ->
      nouController.setBlocklistExcludedHosts(hosts)
    }.runOnQueue(Queues.MAIN)

    Function("setBlocklist") { blocklist: NoraBlocklist ->
      nouController.setBlocklist(blocklist)
    }

    Function("setLocaleStrings") { v: JavaScriptObject ->
      v.getPropertyNames().forEach {
        nouController.i18nStrings[it] = v[it]!!.getString()
      }
    }

    AsyncFunction("clearProfileData") { profile: String ->
      try {
        if (profile == "default") {
          val cookieManager = CookieManager.getInstance()
          cookieManager.removeAllCookies(null)
          cookieManager.flush()
          WebStorage.getInstance().deleteAllData()
          return@AsyncFunction
        }

        if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
          return@AsyncFunction
        }

        val profileStore = ProfileStore.getInstance()
        val targetProfile = profileStore.getProfile(profile) ?: return@AsyncFunction
        targetProfile.cookieManager.removeAllCookies(null)
        targetProfile.cookieManager.flush()
        targetProfile.webStorage.deleteAllData()
        targetProfile.geolocationPermissions.clearAll()
        profileStore.deleteProfile(profile)
      } catch (e: Exception) {
        log("clearProfileData failed: ${e.message}")
      }
    }

    AsyncFunction("clearHostData") { profile: String, host: String ->
      try {
        if (host.isEmpty()) {
          return@AsyncFunction
        }

        val cookieManager: CookieManager
        val webStorage: WebStorage
        if (profile != "default" && WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
          val targetProfile = ProfileStore.getInstance().getProfile(profile) ?: return@AsyncFunction
          cookieManager = targetProfile.cookieManager
          webStorage = targetProfile.webStorage
        } else {
          cookieManager = CookieManager.getInstance()
          webStorage = WebStorage.getInstance()
        }

        // getCookie() returns cookies visible to the origin, including ones set
        // on a parent domain (a ".example.com" cookie shows up on
        // "www.example.com"), but it does not report their domain. Expire each
        // name against every parent domain so parent-scoped session cookies are
        // actually removed; the cookie store drops attempts on a public suffix.
        val domains = cookieDomains(host)
        for (scheme in listOf("https", "http")) {
          val origin = "$scheme://$host"
          webStorage.deleteOrigin(origin)

          // CookieManager has no per-host delete, so expire each cookie.
          val cookies = cookieManager.getCookie(origin) ?: continue
          for (pair in cookies.split(";")) {
            val name = pair.substringBefore("=").trim()
            if (name.isEmpty()) continue
            for (domain in domains) {
              cookieManager.setCookie(origin, "$name=; Max-Age=0; path=/; domain=$domain")
            }
          }
        }
        cookieManager.flush()
      } catch (e: Exception) {
        log("clearHostData failed: ${e.message}")
      }
    }

    AsyncFunction("getCookies") Coroutine { url: String, profile: String? ->
      withContext(Dispatchers.Main) {
        try {
          val manager = if (profile != null && profile != "default" &&
            WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
            // A profile with no store of its own has no cookies, not those of the default profile.
            ProfileStore.getInstance().getProfile(profile)?.cookieManager
          } else {
            CookieManager.getInstance()
          }
          manager?.getCookie(url) ?: ""
        } catch (e: Exception) {
          log("getCookies failed: ${e.message}")
          ""
        }
      }
    }

    AsyncFunction("getProfileCookies") Coroutine { profile: String ->
      val context = appContext.reactContext
      if (context == null) {
        emptyList<Map<String, Any>>()
      } else {
        NoraCookies.getProfileCookies(context, profile, this@NoraViewModule::log)
      }
    }

    // Copies a file the app already has, like media kept for the feed, to the shared
    // Downloads, where the user's other apps can see it. Android 10 and later only: before
    // that it takes a storage permission, and the app shares the file instead.
    AsyncFunction("saveFileToDownloads") Coroutine { sourceUri: String, fileName: String, mimeType: String? ->
      val context = appContext.reactContext ?: return@Coroutine false
      withContext(Dispatchers.IO) {
        val source = File(Uri.parse(sourceUri).path ?: return@withContext false)
        if (!source.exists()) return@withContext false
        val type = mimeType ?: "application/octet-stream"
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q) return@withContext false
        try {
          val values = android.content.ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
            put(MediaStore.MediaColumns.MIME_TYPE, type)
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
          }
          val resolver = context.contentResolver
          val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return@withContext false
          try {
            resolver.openOutputStream(uri)?.use { output -> source.inputStream().use { it.copyTo(output) } }
          } catch (e: Exception) {
            resolver.delete(uri, null, null)
            throw e
          }
          true
        } catch (e: Exception) {
          log("saveFileToDownloads failed: ${e.message}")
          false
        }
      }
    }

    AsyncFunction("openExternalUrl") { url: String ->
      handleExternalAppUrl(appContext.reactContext ?: appContext.throwingActivity, url)
    }

    Function("areNotificationsEnabled") {
      val context = appContext.reactContext
      context != null && NoraNotifications.areEnabled(context)
    }

    // Resolves to whether notifications may be posted; Android 13 and later ask the user first.
    AsyncFunction("requestNotificationPermission") { promise: Promise ->
      val context = appContext.reactContext
      val permissions = appContext.permissions
      if (context == null) {
        promise.resolve(false)
      } else if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || permissions == null) {
        promise.resolve(NoraNotifications.areEnabled(context))
      } else {
        permissions.askForPermissions(
          { promise.resolve(NoraNotifications.areEnabled(context)) },
          Manifest.permission.POST_NOTIFICATIONS
        )
      }
    }

    Function("postNotification") {
      channelId: String,
      channelName: String,
      highImportance: Boolean,
      id: Int,
      title: String,
      body: String,
      url: String? ->
      val context = appContext.reactContext
      try {
        context != null && NoraNotifications.post(context, channelId, channelName, highImportance, id, title, body, url)
      } catch (e: Exception) {
        log("postNotification failed: ${e.message}")
        false
      }
    }

    Function("isPinShortcutSupported") {
      val context = appContext.reactContext
      context != null && NoraShortcuts.isSupported(context)
    }

    AsyncFunction("pinTabShortcut") Coroutine {
      id: String,
      url: String,
      label: String,
      iconUrl: String?,
      manifestUrl: String?,
      profile: String,
      userAgent: String ->
      val context = appContext.reactContext
      if (context == null) {
        false
      } else {
        withContext(Dispatchers.IO) {
          NoraShortcuts.pinTab(context, id, url, label, iconUrl, manifestUrl, profile, userAgent, this@NoraViewModule::log)
        }
      }
    }

    AsyncFunction("translateText") Coroutine { text: String, targetLanguage: String ->
      NoraTranslation.translateText(text, targetLanguage)
    }

    AsyncFunction("getTranslationSupportedLanguages") {
      NoraTranslation.getSupportedLanguages()
    }

    View(NoraView::class) {
      Prop("scriptOnStart") { view: NoraView, script: String ->
        view.setScriptOnStart(script)
      }

      Prop("scriptOnDocumentStart") { view: NoraView, script: String ->
        view.setScriptOnDocumentStart(script)
      }

      Prop("useragent") { view: NoraView, ua: String ->
        view.userAgent = ua
        view.webView.settings.setUserAgentString(ua)
      }

      Prop("profile") { view: NoraView, profile: String ->
        view.setProfile(profile)
      }

      Prop("textZoom") { view: NoraView, zoom: Int ->
        view.setTextZoom(zoom)
      }

      Prop("inspectable") { _: NoraView, inspectable: Boolean ->
        WebView.setWebContentsDebuggingEnabled(inspectable)
      }

      Prop("scrollEvents") { view: NoraView, enabled: Boolean ->
        view.scrollEventsEnabled = enabled
      }

      Prop("pullToRefresh") { view: NoraView, enabled: Boolean ->
        view.setPullToRefresh(enabled)
      }

      Prop("active") { view: NoraView, active: Boolean ->
        view.setActive(active)
      }

      Prop("openAppLinksInTab") { view: NoraView, enabled: Boolean ->
        view.openAppLinksInTab = enabled
      }

      Events("onLoad", "onMessage")

      AsyncFunction("download") { view: NoraView, url: String, fileName: String? ->
        view.download(url, fileName, null)
      }

      AsyncFunction("executeJavaScript") Coroutine
        { view: NoraView, script: String ->
          return@Coroutine view.webView.eval(script)
        }

      AsyncFunction("goBack") { view: NoraView ->
        val webView = view.webView
        if (webView.canGoBack()) {
          webView.goBack()
        } else {
          view.currentActivity?.finish()
        }
      }

      AsyncFunction("canGoBack") { view: NoraView ->
        view.webView.canGoBack()
      }

      AsyncFunction("goForward") { view: NoraView ->
        val webView = view.webView
        if (webView.canGoForward()) {
          webView.goForward()
        }
      }

      AsyncFunction("loadUrl") { view: NoraView, url: String -> view.load(url) }

      // Argument order must match the JS call site: saveFile(content, fileName, mimeType).
      AsyncFunction("saveFile") { view: NoraView, content: String, fileName: String, mimeType: String? ->
        view.saveFile(content, fileName, mimeType)
      }
    }
  }
}
