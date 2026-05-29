package expo.modules.noraview

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.webkit.CookieManager
import android.webkit.WebStorage
import android.webkit.WebView
import android.widget.Toast
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewFeature
import expo.modules.kotlin.functions.Coroutine
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
    }

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

        for (scheme in listOf("https", "http")) {
          val origin = "$scheme://$host"
          webStorage.deleteOrigin(origin)

          // CookieManager has no per-host delete, so expire each cookie.
          val cookies = cookieManager.getCookie(origin) ?: continue
          for (pair in cookies.split(";")) {
            val name = pair.substringBefore("=").trim()
            if (name.isEmpty()) continue
            for (domain in listOf(host, ".$host")) {
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
            ProfileStore.getInstance().getProfile(profile)?.cookieManager
              ?: CookieManager.getInstance()
          } else {
            CookieManager.getInstance()
          }
          manager.getCookie(url) ?: ""
        } catch (e: Exception) {
          log("getCookies failed: ${e.message}")
          ""
        }
      }
    }

    AsyncFunction("openExternalUrl") { url: String ->
      handleExternalAppUrl(appContext.reactContext ?: appContext.throwingActivity, url)
    }

    View(NoraView::class) {
      Prop("scriptOnStart") { view: NoraView, script: String ->
        view.setScriptOnStart(script)
      }

      Prop("useragent") { view: NoraView, ua: String ->
        view.userAgent = ua
        view.webView.settings.setUserAgentString(ua)
      }

      Prop("profile") { view: NoraView, profile: String ->
        view.setProfile(profile)
      }

      Prop("inspectable") { _: NoraView, inspectable: Boolean ->
        WebView.setWebContentsDebuggingEnabled(inspectable)
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

      AsyncFunction("saveFile") { view: NoraView, fileName: String, mimeType: String, content: String ->
        view.saveFile(fileName, mimeType, content)
      }
    }
  }
}
