package expo.modules.noraview

import android.app.Activity
import android.app.ActivityManager
import android.app.DownloadManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.view.ContextMenu
import android.view.View
import android.view.ViewGroup
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceResponse
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.io.ByteArrayInputStream
import androidx.webkit.ScriptHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * Browserless window used by pinned site shortcuts. It deliberately lives outside the
 * React activity so Android gives it an independent task and Nora's browser chrome is
 * never mounted around the page.
 */
class NoraStandaloneActivity : Activity() {
  companion object {
    const val EXTRA_LABEL = "nora.standalone.label"
    const val EXTRA_PROFILE = "nora.standalone.profile"
    const val EXTRA_USER_AGENT = "nora.standalone.userAgent"
    private const val FILE_CHOOSER_REQUEST = 8104
    private const val SAVE_IMAGE_REQUEST = 8105
  }

  private lateinit var webView: NouWebView
  private lateinit var rootView: FrameLayout
  private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
  private var customView: View? = null
  private var customViewCallback: WebChromeClient.CustomViewCallback? = null
  private var pendingImageUrl: String? = null
  private var blockingScriptHandler: ScriptHandler? = null
  private lateinit var contentScript: String
  private lateinit var youtubeScript: String
  private val blockingScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
  private var blockingReady = false
  private var cosmeticUpdate = 0
  @Volatile private var pageUrl = ""

  // Keep ad observers in the top frame and the YouTube guard in player frames. No filter-list data is
  // injected: only this compact bundle and the site's exceptions run at startup.
  private fun blockingScript(): String = nouController.blocklistExclusionsScript() +
    "\n;\n" + youtubeScript + "\n;\nif(window === window.top){\n" + contentScript + "\n}"

  private fun applyCosmeticCss(url: String) {
    val host = Uri.parse(url).host ?: return
    val update = ++cosmeticUpdate
    blockingScope.launch {
      val css = withContext(Dispatchers.IO) { nouController.cosmeticCssForHost(host) }
      if (update != cosmeticUpdate) return@launch
      val enabled = !nouController.isBlocklistExcludedHost(host)
      // Match the host so an early SPA replaceState doesn't discard its CSS.
      val script = "if(location.hostname===${JSONObject.quote(host)})window.Nora?.setSettings?.({cosmeticCss:${JSONObject.quote(css)},adBlockingEnabled:$enabled})"
      webView.evaluateJavascript(script, null)
    }
  }

  internal fun refreshBlockingScript() {
    blockingScriptHandler?.remove()
    blockingScriptHandler = null
    if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
      try {
        blockingScriptHandler = WebViewCompat.addDocumentStartJavaScript(webView, blockingScript(), setOf("*"))
      } catch (e: Exception) {
        nouController.log("standalone document start script failed: ${e.message}")
      }
    }
    if (blockingReady) applyCosmeticCss(pageUrl)
  }

  // A shortcut can start the process without mounting React, which normally supplies
  // localized strings. Reuse the last locale, with defaults for the first launch.
  private fun t(key: String): String = nouController.i18nStrings[key]
    ?: getSharedPreferences("nora.locale", Context.MODE_PRIVATE).getString(key, null)
    ?: when (key) {
      "menu_saveImage" -> "Save image"
      "menu_openImageInNewTab" -> "Open image in new tab"
      "menu_copyImageLink" -> "Copy image link"
      "menu_openInNewTab" -> "Open in new tab"
      "menu_copyLink" -> "Copy link"
      "toast_downloadStarted" -> "Download started"
      "toast_downloadSucceeded" -> "Download succeeded"
      else -> "Download failed"
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    pendingImageUrl = savedInstanceState?.getString("pendingImageUrl")
    window.statusBarColor = Color.BLACK
    window.navigationBarColor = Color.BLACK
    WindowCompat.setDecorFitsSystemWindows(window, false)

    webView = NouWebView(this).apply {
      layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
      settings.setSupportMultipleWindows(false)
      settings.userAgentString = intent.getStringExtra(EXTRA_USER_AGENT) ?: uaAndroid
    }
    rootView = FrameLayout(this).apply {
      setBackgroundColor(Color.BLACK)
      addView(webView)
    }
    ViewCompat.setOnApplyWindowInsetsListener(rootView) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      // Web content does not consistently honor the top safe-area inset, while sites
      // such as X already use the bottom CSS safe area for their fixed navigation bar.
      view.setPadding(bars.left, bars.top, bars.right, 0)
      insets
    }
    setContentView(rootView)
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = false
      isAppearanceLightNavigationBars = false
    }
    configureProfile(intent.getStringExtra(EXTRA_PROFILE) ?: "default")
    configureWebView()
    updateTaskLabel(intent.getStringExtra(EXTRA_LABEL))
    val launchIntent = intent
    blockingScope.launch {
      val scripts = withContext(Dispatchers.IO) {
        nouController.restoreBlocking(applicationContext)
        Pair(assets.open("nora-standalone.js").bufferedReader().use { it.readText() },
          assets.open("nora-youtube.js").bufferedReader().use { it.readText() })
      }
      contentScript = scripts.first
      youtubeScript = scripts.second
      refreshBlockingScript()
      nouController.registerStandalone(this@NoraStandaloneActivity)
      blockingReady = true
      pageUrl = intent.dataString.orEmpty()
      if (savedInstanceState != null && intent === launchIntent) {
        webView.restoreState(savedInstanceState)
      } else {
        loadIntent(intent)
      }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    updateTaskLabel(intent.getStringExtra(EXTRA_LABEL))
    val userAgent = intent.getStringExtra(EXTRA_USER_AGENT)
    if (!userAgent.isNullOrEmpty()) {
      webView.settings.userAgentString = userAgent
    }
    if (blockingReady) loadIntent(intent)
  }

  private fun configureProfile(profile: String) {
    if (profile == "default" || !WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
      return
    }
    try {
      WebViewCompat.setProfile(webView, profile)
    } catch (e: Exception) {
      nouController.log("set standalone profile failed: ${e.message}")
    }
  }

  private fun configureWebView() {
    registerForContextMenu(webView)
    installGoogleOAuthShim(webView)
    webView.webViewClient = object : WebViewClient() {
      override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
        pageUrl = url
        if (blockingScriptHandler == null) view.evaluateJavascript(blockingScript(), null)
        applyCosmeticCss(url)
      }

      override fun onPageFinished(view: WebView, url: String) {
        applyCosmeticCss(url)
      }

      override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
        pageUrl = url
      }

      override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
        if (!request.isForMainFrame && nouController.shouldBlockRequestHost(request.url.host, Uri.parse(pageUrl).host)) {
          return WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
        }
        return null
      }

      override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
        shouldOverrideUrlLoading(view, request.url.toString())

      @Suppress("DEPRECATION")
      override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
        val scheme = Uri.parse(url).scheme?.lowercase()
        return if (scheme == "http" || scheme == "https" || scheme == "about") {
          false
        } else {
          handleExternalAppUrl(this@NoraStandaloneActivity, url)
        }
      }

      override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        finishAndRemoveTask()
        return true
      }
    }

    webView.webChromeClient = object : WebChromeClient() {
      override fun onReceivedTitle(view: WebView, title: String) {
        if (title.isNotBlank()) {
          updateTaskLabel(title)
        }
      }

      override fun onPermissionRequest(request: PermissionRequest) {
        val allowed = request.resources.filter { resource ->
          when (resource) {
            PermissionRequest.RESOURCE_AUDIO_CAPTURE ->
              ContextCompat.checkSelfPermission(
                this@NoraStandaloneActivity,
                android.Manifest.permission.RECORD_AUDIO,
              ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            PermissionRequest.RESOURCE_VIDEO_CAPTURE ->
              ContextCompat.checkSelfPermission(
                this@NoraStandaloneActivity,
                android.Manifest.permission.CAMERA,
              ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            else -> true
          }
        }
        if (allowed.isEmpty()) request.deny() else request.grant(allowed.toTypedArray())
      }

      override fun onShowFileChooser(
        view: WebView,
        callback: ValueCallback<Array<Uri>>,
        params: FileChooserParams,
      ): Boolean {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = callback
        return try {
          startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST)
          true
        } catch (e: Exception) {
          fileChooserCallback = null
          callback.onReceiveValue(null)
          false
        }
      }

      override fun onShowCustomView(view: View, callback: CustomViewCallback) {
        if (customView != null) {
          callback.onCustomViewHidden()
          return
        }
        customView = view
        customViewCallback = callback
        (window.decorView as FrameLayout).addView(
          view,
          FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
          ),
        )
        WindowCompat.getInsetsController(window, window.decorView).apply {
          hide(WindowInsetsCompat.Type.systemBars())
          systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
      }

      override fun onHideCustomView() {
        hideCustomView()
      }
    }
  }

  override fun onCreateContextMenu(menu: ContextMenu, view: View, info: ContextMenu.ContextMenuInfo?) {
    super.onCreateContextMenu(menu, view, info)
    if (view !== webView) return
    val hit = webView.hitTestResult
    val url = hit.extra?.takeIf { it.isNotBlank() } ?: return
    if (!isWebUrl(url)) return
    when (hit.type) {
      WebView.HitTestResult.IMAGE_TYPE, WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE -> {
        menu.add(t("menu_saveImage")).setOnMenuItemClickListener {
          saveImage(url)
          true
        }
        menu.add(t("menu_openImageInNewTab")).setOnMenuItemClickListener {
          openInBrowser(url)
          true
        }
        menu.add(t("menu_copyImageLink")).setOnMenuItemClickListener {
          copyLink("image", url)
          true
        }
      }
      WebView.HitTestResult.SRC_ANCHOR_TYPE -> {
        menu.add(t("menu_openInNewTab")).setOnMenuItemClickListener {
          openInBrowser(url)
          true
        }
        menu.add(t("menu_copyLink")).setOnMenuItemClickListener {
          copyLink("link", url)
          true
        }
      }
    }
  }

  private fun copyLink(label: String, url: String) {
    (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager)
      .setPrimaryClip(ClipData.newPlainText(label, url))
  }

  private fun openInBrowser(url: String) {
    if (!isWebUrl(url)) return
    val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return
    intent.action = Intent.ACTION_VIEW
    intent.data = Uri.parse(url)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    startActivity(intent)
  }

  private fun saveImage(url: String) {
    // DownloadManager and URLConnection cannot resolve page-local blob URLs.
    if (!isWebUrl(url)) {
      Toast.makeText(this, t("toast_downloadFailed"), Toast.LENGTH_LONG).show()
      return
    }
    try {
      // Preserve explicit image extensions; extensionless image endpoints need an
      // image suffix rather than URLUtil's default .bin.
      val uri = Uri.parse(url)
      val extension = uri.lastPathSegment?.substringAfterLast('.', "")?.lowercase()
      val format = uri.getQueryParameter("format")?.lowercase()
      val mimeType = android.webkit.MimeTypeMap.getSingleton()
        .getMimeTypeFromExtension(extension.orEmpty())?.takeIf { it.startsWith("image/") }
        ?: android.webkit.MimeTypeMap.getSingleton()
          .getMimeTypeFromExtension(format.orEmpty())?.takeIf { it.startsWith("image/") }
        ?: "image/jpeg"
      val name = URLUtil.guessFileName(url, null, mimeType)
      if (getSharedPreferences("nora.standalone", Context.MODE_PRIVATE)
          .getBoolean("askDownloadDestination", nouController.settings.askDownloadDestination)) {
        pendingImageUrl = url
        startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = mimeType
          putExtra(Intent.EXTRA_TITLE, name)
        }, SAVE_IMAGE_REQUEST)
      } else {
        val request = DownloadManager.Request(Uri.parse(url))
          .setMimeType(mimeType)
          .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
          .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
          .addRequestHeader("User-Agent", webView.settings.userAgentString)
        (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
        Toast.makeText(this, t("toast_downloadStarted"), Toast.LENGTH_LONG).show()
      }
    } catch (_: Exception) {
      pendingImageUrl = null
      Toast.makeText(this, t("toast_downloadFailed"), Toast.LENGTH_LONG).show()
    }
  }

  private fun isWebUrl(url: String): Boolean = Uri.parse(url).scheme?.lowercase() in listOf("http", "https")

  private fun saveImageToDocument(url: String, destination: Uri) {
    val app = applicationContext
    val userAgent = webView.settings.userAgentString
    Thread {
      val message = try {
        val connection = java.net.URL(url).openConnection().apply {
          connectTimeout = 30000
          readTimeout = 30000
          setRequestProperty("User-Agent", userAgent)
        }
        connection.getInputStream().use { input ->
          (app.contentResolver.openOutputStream(destination) ?: error("Cannot open destination")).use { output ->
            input.copyTo(output)
          }
        }
        "toast_downloadSucceeded"
      } catch (_: Exception) {
        try {
          android.provider.DocumentsContract.deleteDocument(app.contentResolver, destination)
        } catch (_: Exception) {
        }
        "toast_downloadFailed"
      }
      android.os.Handler(android.os.Looper.getMainLooper()).post {
        val label = nouController.i18nStrings[message]
          ?: app.getSharedPreferences("nora.locale", Context.MODE_PRIVATE).getString(message, null)
          ?: if (message == "toast_downloadSucceeded") "Download succeeded" else "Download failed"
        Toast.makeText(app, label, Toast.LENGTH_LONG).show()
      }
    }.start()
  }

  private fun loadIntent(intent: Intent) {
    val url = intent.dataString ?: return finishAndRemoveTask()
    val scheme = Uri.parse(url).scheme?.lowercase()
    if (scheme != "http" && scheme != "https") {
      finishAndRemoveTask()
      return
    }
    pageUrl = url
    webView.loadUrl(url)
  }

  @Suppress("DEPRECATION")
  private fun updateTaskLabel(label: String?) {
    if (label.isNullOrBlank()) return
    setTaskDescription(ActivityManager.TaskDescription(label))
  }

  private fun hideCustomView() {
    val view = customView ?: return
    (window.decorView as FrameLayout).removeView(view)
    customView = null
    customViewCallback?.onCustomViewHidden()
    customViewCallback = null
    WindowCompat.getInsetsController(window, window.decorView).show(WindowInsetsCompat.Type.systemBars())
  }

  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    when {
      customView != null -> hideCustomView()
      webView.canGoBack() -> webView.goBack()
      else -> super.onBackPressed()
    }
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode == SAVE_IMAGE_REQUEST) {
      val url = pendingImageUrl
      pendingImageUrl = null
      val destination = data?.data
      if (resultCode == RESULT_OK && url != null && destination != null) {
        saveImageToDocument(url, destination)
      }
      return
    }
    if (requestCode != FILE_CHOOSER_REQUEST) return
    fileChooserCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
    fileChooserCallback = null
  }

  override fun onSaveInstanceState(outState: Bundle) {
    outState.putString("pendingImageUrl", pendingImageUrl)
    webView.saveState(outState)
    super.onSaveInstanceState(outState)
  }

  override fun onPause() {
    webView.onPause()
    super.onPause()
  }

  override fun onResume() {
    super.onResume()
    webView.onResume()
  }

  override fun onDestroy() {
    blockingScope.cancel()
    fileChooserCallback?.onReceiveValue(null)
    fileChooserCallback = null
    hideCustomView()
    unregisterForContextMenu(webView)
    nouController.unregisterStandalone(this)
    blockingScriptHandler?.remove()
    blockingScriptHandler = null
    webView.stopLoading()
    webView.destroy()
    super.onDestroy()
  }
}
