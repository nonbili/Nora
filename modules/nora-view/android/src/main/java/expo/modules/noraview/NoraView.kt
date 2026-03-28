package expo.modules.noraview

import android.app.Activity
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Environment
import android.provider.MediaStore
import android.util.AttributeSet
import android.util.Log
import android.view.ContextMenu
import android.view.GestureDetector
import android.view.MenuItem
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.JsResult
import android.webkit.MimeTypeMap
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.core.view.GestureDetectorCompat
import androidx.core.view.ViewCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import java.nio.charset.Charset
import java.util.Base64
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import org.apache.tika.Tika

val VIEW_HOSTS = arrayOf(
  "bsky.app",
  "www.linkedin.com",
  "www.instagram.com",
  "chat.reddit.com",
  "old.reddit.com",
  "www.reddit.com",
  "www.threads.com",
  "www.tiktok.com",
  "www.tumblr.com",
  "id.vk.com",
  "login.vk.com",
  "login.vk.ru",
  "m.vk.com",
  "vk.com",
  "x.com"
)

// https://www.whatismybrowser.com/guides/the-latest-user-agent/chrome
val uaAndroid = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.172 Mobile Safari/537.36"
val uaLinux = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"

class NouWebView @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null, defStyleAttr: Int = 0) :
  WebView(context, attrs, defStyleAttr) {

  init {
    settings.run {
      javaScriptEnabled = true
      domStorageEnabled = true
      mediaPlaybackRequiresUserGesture = false
      builtInZoomControls = true
      displayZoomControls = false
      setSupportMultipleWindows(true)
    }
    CookieManager.getInstance().setAcceptCookie(true)

    // https://stackoverflow.com/a/64564676
    setFocusable(true)
    setFocusableInTouchMode(true)

    // setWebContentsDebuggingEnabled(true)
  }

  suspend fun eval(script: String): String? = suspendCancellableCoroutine { cont ->
    evaluateJavascript(script) { result ->
      if (result == "null") {
        cont.resume(null, null)
      } else {
        cont.resume(result, null)
      }
    }
  }
}

fun redirectFacebookUrl(url: String): String? {
  val uri = Uri.parse(url)
  if (uri.scheme == "fb" && uri.host == "fullscreen_video") {
    val videoId = uri.lastPathSegment
    if (videoId != null) {
      return "https://m.facebook.com/reel/$videoId/"
    }
  }
  return null
}

fun isMessengerUrl(url: String): Boolean {
  return url.startsWith("https://www.facebook.com/messages/") || url.startsWith("https://m.facebook.com/messages/")
}

fun shouldRedirectFacebookToMobile(currentUrl: String, targetUrl: String): Boolean {
  if (!targetUrl.startsWith("https://www.facebook.com/")) {
    return false
  }
  if (isMessengerUrl(targetUrl)) {
    return false
  }
  if (isMessengerUrl(currentUrl)) {
    return false
  }
  return true
}

fun extractFacebookProfileId(url: String?): String? {
  if (url.isNullOrBlank()) {
    return null
  }
  return try {
    val uri = Uri.parse(url)
    val host = uri.host?.lowercase()
    if (host?.endsWith("facebook.com") != true) {
      return null
    }
    if (uri.encodedPath == "/profile.php") {
      return uri.getQueryParameter("id")?.takeIf { it.isNotBlank() }
    }
    null
  } catch (_: Exception) {
    null
  }
}

fun normalizeMessengerUrl(url: String, currentUrl: String? = null, depth: Int = 0): String? {
  if (depth > 3) {
    return null
  }
  val uri = Uri.parse(url)
  val scheme = uri.scheme?.lowercase()
  val host = uri.host?.lowercase()
  val currentProfileId = extractFacebookProfileId(currentUrl)

  if ((scheme == "https" || scheme == "http") && (host == "www.messenger.com" || host == "messenger.com")) {
    val path = uri.encodedPath ?: "/"
    val normalizedPath = if (path == "/" || path.isEmpty()) "/messages/" else "/messages$path"
    val query = uri.encodedQuery?.let { "?$it" } ?: ""
    val fragment = uri.encodedFragment?.let { "#$it" } ?: ""
    return "https://www.facebook.com$normalizedPath$query$fragment"
  }

  if ((scheme == "https" || scheme == "http") && (host == "m.me" || host == "www.m.me")) {
    val segments = uri.pathSegments.filter { it.isNotBlank() }
    if (segments.isEmpty()) {
      return "https://www.facebook.com/messages/"
    }
    val target = segments.joinToString("/")
    return "https://www.facebook.com/messages/t/$target"
  }

  if (scheme == "fb-messenger") {
    val target = currentProfileId ?: uri.pathSegments.lastOrNull()?.takeIf { it.isNotBlank() }
    if ((uri.host == "user-thread" || uri.host == "user") && target != null) {
      return "https://www.facebook.com/messages/t/$target"
    }
    return "https://www.facebook.com/messages/"
  }

  if (scheme == "intent") {
    try {
      val intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
      val intentData = intent.data
      val intentScheme = intentData?.scheme?.lowercase()
      val intentHost = intentData?.host?.lowercase()
      val intentTarget = currentProfileId ?: intentData?.pathSegments?.lastOrNull()?.takeIf { it.isNotBlank() }
      if (intentScheme == "fb-messenger") {
        if ((intentHost == "user-thread" || intentHost == "user") && intentTarget != null) {
          return "https://www.facebook.com/messages/t/$intentTarget"
        }
        return "https://www.facebook.com/messages/"
      }
      val fallbackUrl = intent.getStringExtra("browser_fallback_url")
      if (!fallbackUrl.isNullOrEmpty()) {
        return normalizeMessengerUrl(fallbackUrl, currentUrl, depth + 1) ?: fallbackUrl
      }
    } catch (_: Exception) {
    }
  }

  val queryKeys = listOf("u", "url", "href", "link", "target_url", "redirect_uri", "browser_fallback_url")
  for (key in queryKeys) {
    val value = uri.getQueryParameter(key)?.takeIf { it.isNotBlank() } ?: continue
    val normalized = normalizeMessengerUrl(value, currentUrl, depth + 1)
    if (normalized != null) {
      return normalized
    }
    if (isMessengerUrl(value)) {
      return value
    }
  }

  return null
}

fun traceFacebookNavigation(stage: String, currentUrl: String, targetUrl: String, normalizedUrl: String? = null) {
  if (
    currentUrl.contains("facebook.com") ||
    currentUrl.contains("messenger.com") ||
    targetUrl.contains("facebook.com") ||
    targetUrl.contains("messenger.com") ||
    targetUrl.startsWith("fb-messenger:") ||
    targetUrl.startsWith("intent:")
  ) {
    val suffix = normalizedUrl?.let { ", normalized=$it" } ?: ""
    nouController.log("[fb-nav] $stage current=$currentUrl target=$targetUrl$suffix")
  }
}

fun shouldOpenMessengerInNewTab(currentUrl: String, normalizedUrl: String?): Boolean {
  if (normalizedUrl == null || !normalizedUrl.startsWith("https://www.facebook.com/messages/")) {
    return false
  }
  return currentUrl.startsWith("https://m.facebook.com/") && !isMessengerUrl(currentUrl)
}

val INTERNAL_SCHEMES = setOf("about", "blob", "data", "file", "http", "https", "javascript", "nora")

fun shouldNoraOverrideUrlLoading(view: WebView, url: String): Boolean {
  val uri = Uri.parse(url)
  val host = uri.host
  val scheme = uri.scheme?.lowercase()
  val normalizedHost = host?.lowercase()
  val dynamicInternalHosts = nouController.settings.internalHosts.map { it.lowercase() }.toSet()
  val isInternalScheme = scheme in INTERNAL_SCHEMES
  val isFacebookHost = normalizedHost?.endsWith(".facebook.com") == true && normalizedHost != "l.facebook.com"

  if (!isInternalScheme) {
    return handleExternalAppUrl(view.context, url)
  }

  if (host in VIEW_HOSTS ||
    (normalizedHost != null && normalizedHost in dynamicInternalHosts) ||
    isFacebookHost ||
    !nouController.settings.openExternalLinkInSystemBrowser
  ) {
    return false
  } else {
    try {
      view.getContext().startActivity(Intent(Intent.ACTION_VIEW, uri))
    } catch (e: ActivityNotFoundException) {
      e.printStackTrace()
    }
    return true
  }
}

fun handleExternalAppUrl(context: Context, url: String): Boolean {
  val uri = Uri.parse(url)
  val scheme = uri.scheme?.lowercase()
  val isInternalScheme = scheme in INTERNAL_SCHEMES
  if (isInternalScheme) {
    return false
  }

  try {
    val intent = if (scheme == "intent") {
      Intent.parseUri(url, Intent.URI_INTENT_SCHEME).apply {
        addCategory(Intent.CATEGORY_BROWSABLE)
        component = null
        selector = null
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
    } else {
      Intent(Intent.ACTION_VIEW, uri).apply {
        addCategory(Intent.CATEGORY_BROWSABLE)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
    }
    val packageManager = context.packageManager
    val resolvedActivity = intent.resolveActivity(packageManager)
    if (resolvedActivity == null) {
      throw ActivityNotFoundException("No activity found to handle $url")
    }
    context.startActivity(intent)
    return true
  } catch (e: ActivityNotFoundException) {
    if (scheme == "intent") {
      try {
        val fallbackIntent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
        val fallbackUrl = fallbackIntent.getStringExtra("browser_fallback_url")
        if (!fallbackUrl.isNullOrEmpty()) {
          context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(fallbackUrl)).apply {
              addCategory(Intent.CATEGORY_BROWSABLE)
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
          )
          return true
        }

        val dataUri = fallbackIntent.data
        if (dataUri != null) {
          context.startActivity(
            Intent(Intent.ACTION_VIEW, dataUri).apply {
              addCategory(Intent.CATEGORY_BROWSABLE)
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
              `package` = null
              selector = null
              component = null
            }
          )
          return true
        }
      } catch (fallbackError: Exception) {
        fallbackError.printStackTrace()
      }
    }
    e.printStackTrace()
    return true
  } catch (e: Exception) {
    e.printStackTrace()
    return true
  }
}

class NoraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onLoad by EventDispatcher()
  internal val onMessage by EventDispatcher()

  private var scriptOnStart = ""
  private var pageUrl = ""
  private var customView: View? = null
  private var contextMenuLinkUrl: String? = null
  private var contextMenuImageUrl: String? = null
  internal var userAgent: String? = null
  private var profileSet = false

  private var gestureDetector = GestureDetectorCompat(context, NoraGestureListener())

  internal val currentActivity: Activity?
    get() = appContext.currentActivity

  override fun onCreateContextMenu(menu: ContextMenu) {
    super.onCreateContextMenu(menu)

    val result = webView.getHitTestResult()
    val activity = currentActivity
    val fallbackUrl = result.getExtra()
    val linkUrl =
      contextMenuLinkUrl ?: if (
        result.getType() in arrayOf(WebView.HitTestResult.SRC_ANCHOR_TYPE, WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE)
      ) fallbackUrl else null
    val imageUrl =
      contextMenuImageUrl ?: if (
        result.getType() in arrayOf(WebView.HitTestResult.IMAGE_TYPE, WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE)
      ) fallbackUrl else null

    if ((linkUrl == null && imageUrl == null) || activity == null) {
      return
    }

    fun copyUrl(label: String, targetUrl: String) =
      object : MenuItem.OnMenuItemClickListener {
        override fun onMenuItemClick(item: MenuItem): Boolean {
          val clipboardManager = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
          val clipData = ClipData.newPlainText(label, targetUrl)
          clipboardManager.setPrimaryClip(clipData)
          return true
        }
      }

    fun openInNewTab(targetUrl: String, kind: String? = null) =
      object : MenuItem.OnMenuItemClickListener {
        override fun onMenuItemClick(item: MenuItem): Boolean {
          val payload = mutableMapOf<String, Any>("url" to targetUrl)
          if (kind != null) {
            payload["kind"] = kind
          }
          emit("new-tab", payload)
          return true
        }
      }

    if (
      result.getType() in arrayOf(WebView.HitTestResult.IMAGE_TYPE, WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE)
    ) {
      val imageTargetUrl = imageUrl ?: return
      val onDownload = object : MenuItem.OnMenuItemClickListener {
        override fun onMenuItemClick(item: MenuItem): Boolean {
          download(imageTargetUrl, null, "image/jpeg")
          return true
        }
      }

      menu.add(nouController.t("menu_saveImage")).setOnMenuItemClickListener(onDownload)
      menu.add(nouController.t("menu_openImageInNewTab")).setOnMenuItemClickListener(openInNewTab(imageTargetUrl, "image"))
      menu.add(nouController.t("menu_copyImageLink")).setOnMenuItemClickListener(copyUrl("image", imageTargetUrl))
      if (result.getType() == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE && linkUrl != null && linkUrl != imageTargetUrl) {
        menu.add(nouController.t("menu_openInNewTab")).setOnMenuItemClickListener(openInNewTab(linkUrl))
        menu.add(nouController.t("menu_copyLink")).setOnMenuItemClickListener(copyUrl("link", linkUrl))
      }
    } else if (result.getType() == WebView.HitTestResult.SRC_ANCHOR_TYPE && linkUrl != null) {
      menu.add(nouController.t("menu_openInNewTab")).setOnMenuItemClickListener(openInNewTab(linkUrl))
      menu.add(nouController.t("menu_copyLink")).setOnMenuItemClickListener(copyUrl("link", linkUrl))
    }
  }

  private fun prepareContextMenuTargets() {
    contextMenuLinkUrl = null
    contextMenuImageUrl = null

    val result = webView.getHitTestResult()
    when (result.getType()) {
      WebView.HitTestResult.SRC_ANCHOR_TYPE -> contextMenuLinkUrl = result.getExtra()
      WebView.HitTestResult.IMAGE_TYPE -> contextMenuImageUrl = result.getExtra()
      WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE -> contextMenuImageUrl = result.getExtra()
    }

    val handler =
      Handler(Looper.getMainLooper()) { msg ->
        val data = msg.data
        val linkUrl = data?.getString("url")?.takeIf { it.isNotEmpty() }
        val imageUrl = data?.getString("src")?.takeIf { it.isNotEmpty() }
        if (linkUrl != null) {
          contextMenuLinkUrl = linkUrl
        }
        if (imageUrl != null) {
          contextMenuImageUrl = imageUrl
        }
        false
      }
    webView.requestFocusNodeHref(handler.obtainMessage())
  }

  inner class NoraGestureListener : GestureDetector.SimpleOnGestureListener() {
    override fun onDown(e: MotionEvent): Boolean = true

    override fun onScroll(e1: MotionEvent?, e2: MotionEvent, distanceX: Float, distanceY: Float): Boolean {
      var dy = distanceY
      if (e1 != null) {
        dy = e2.y - e1.y
      }
      emit("scroll", mapOf("dy" to dy))
      return true
    }
  }

  internal val webView =
    NouWebView(context).apply {
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
      webViewClient =
        object : WebViewClient() {
          override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
            if (nouController.settings.redirectToOldReddit && url.startsWith("https://www.reddit.com/")) {
              load(url.replace("www.reddit.com", "old.reddit.com"))
              return
            }
            if (url.startsWith("https://m.facebook.com/messages/")) {
              load("https://www.facebook.com/messages/")
              return
            }
            if (shouldRedirectFacebookToMobile(pageUrl, url)) {
              load(url.replace("www", "m"))
              return
            }
            pageUrl = url
            onLoad(
              mapOf(
                "canGoBack" to view.canGoBack(),
                "url" to pageUrl
              )
            )
          }

          override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            pageUrl = url
            evaluateJavascript(scriptOnStart, null)
          }

          override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            if (!request.isForMainFrame && nouController.shouldBlockRequestHost(request.url.host)) {
              return WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
            }
            if (request.url.scheme == "http" && !nouController.settings.allowHttpWebsite) {
              return WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
            }
            return null
          }

          override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
            val normalizedMessengerUrl = normalizeMessengerUrl(url, pageUrl)
            traceFacebookNavigation("override", pageUrl, url, normalizedMessengerUrl)
            if (normalizedMessengerUrl != null && normalizedMessengerUrl != url) {
              if (shouldOpenMessengerInNewTab(pageUrl, normalizedMessengerUrl)) {
                traceFacebookNavigation("override-new-tab", pageUrl, url, normalizedMessengerUrl)
                emit("new-tab", mapOf("url" to normalizedMessengerUrl))
                return true
              }
              load(normalizedMessengerUrl)
              return true
            }
            if (url.startsWith("http://") && !nouController.settings.allowHttpWebsite) {
              showHttpBlockedPage(url)
              return true
            }
            if (nouController.settings.redirectToOldReddit && url.startsWith("https://www.reddit.com/")) {
              load(url.replace("www.reddit.com", "old.reddit.com"))
              return true
            }
            val redirectedUrl = redirectFacebookUrl(url)
            if (redirectedUrl != null && !pageUrl.startsWith(redirectedUrl)) {
              traceFacebookNavigation("redirect-facebook", pageUrl, url, redirectedUrl)
              load(redirectedUrl)
              return true
            }
            if (shouldRedirectFacebookToMobile(pageUrl, url)) {
              traceFacebookNavigation("redirect-mobile", pageUrl, url, url.replace("www", "m"))
              load(url.replace("www", "m"))
              return true
            }
            return shouldNoraOverrideUrlLoading(view, url)
          }

          override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            return shouldOverrideUrlLoading(view, request.url.toString())
          }

          override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            log("onRenderProcessGone crash: ${detail.didCrash()}")
            view.post {
              load(pageUrl)
            }
            return true
          }
        }

      webChromeClient = object : WebChromeClient() {
        override fun onReceivedIcon(view: WebView, icon: Bitmap) {
          emit("icon", "")
        }

        override fun onReceivedTitle(view: WebView, title: String) {
          onLoad(
            mapOf(
              "canGoBack" to view.canGoBack(),
              "title" to title
            )
          )
        }

        override fun onPermissionRequest(request: PermissionRequest) {
          val activity = currentActivity
          if (activity == null) {
            request.deny()
            return
          }

          val resources = request.resources
          val permissionsToRequest = mutableListOf<String>()

          if (resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
            permissionsToRequest.add(android.Manifest.permission.RECORD_AUDIO)
          }
          if (resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
            permissionsToRequest.add(android.Manifest.permission.CAMERA)
          }

          if (permissionsToRequest.isEmpty()) {
            request.grant(resources)
            return
          }

          // In a real production app, we should handle the result of the permission request.
          // For now, we request them and grant the WebView request.
          // Note: If the user denies, the WebView will just fail to get the stream.
          activity.requestPermissions(permissionsToRequest.toTypedArray(), 101)
          request.grant(resources)
        }

        override fun onJsBeforeUnload(view: WebView, url: String, message: String, result: JsResult): Boolean {
          result.confirm()
          return true
        }

        override fun onShowCustomView(view: View, cllback: CustomViewCallback) {
          customView = view
          val activity = currentActivity
          if (activity == null) {
            return
          }
          val window = activity.window
          (window.decorView as FrameLayout).addView(
            view,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
          )

          // https://stackoverflow.com/a/64828067
          val controller = WindowCompat.getInsetsController(window, window.decorView)
          controller.hide(WindowInsetsCompat.Type.systemBars())
          controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        override fun onHideCustomView() {
          val activity = currentActivity
          if (activity == null || customView == null) {
            return
          }
          val window = activity.window
          (window.decorView as FrameLayout).removeView(customView)
          val controller = WindowCompat.getInsetsController(window, window.decorView)
          controller.show(WindowInsetsCompat.Type.systemBars())
        }

        override fun onShowFileChooser(
          view: WebView,
          callback: ValueCallback<Array<Uri>>,
          params: WebChromeClient.FileChooserParams
        ): Boolean {
          // https://stackoverflow.com/a/62625964
          nouController.setFileChooserCallback(callback)
          val intent = params.createIntent()
          val activity = currentActivity
          activity?.startActivityForResult(intent, 0)
          return true
        }

        override fun onCreateWindow(
          view: WebView,
          isDialog: Boolean,
          isUserGesture: Boolean,
          resultMsg: android.os.Message
        ): Boolean {
          val newWebView = WebView(view.getContext())
          newWebView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
              val normalizedMessengerUrl = normalizeMessengerUrl(url, pageUrl)
              traceFacebookNavigation("create-window", pageUrl, url, normalizedMessengerUrl)
              if (normalizedMessengerUrl != null && normalizedMessengerUrl != url) {
                log("new-tab: $normalizedMessengerUrl")
                emit("new-tab", mapOf("url" to normalizedMessengerUrl))
                return true
              }
              val ret = shouldNoraOverrideUrlLoading(view, url)
              if (ret) {
                return true
              }
              log("new-tab: $url")
              emit("new-tab", mapOf("url" to url))
              return true
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
              return shouldOverrideUrlLoading(view, request.url.toString())
            }
          }

          val transport = resultMsg.obj as WebView.WebViewTransport
          transport.setWebView(newWebView)
          resultMsg.sendToTarget()
          return true
        }
      }

      setDownloadListener(
        object : DownloadListener {
          override fun onDownloadStart(
            url: String,
            userAgent: String,
            contentDisposition: String,
            mimeType: String,
            contentLength: Long
          ) {
            var fileName: String? = null
            if (contentDisposition != "") {
              fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
            }
            if (url.startsWith("blob:")) {
              if (fileName != null) {
                fileName = "'$fileName'"
              }
              evaluateJavascript("window.Nora?.downloadBlob('$url', $fileName, '$mimeType')", null)
            } else {
              download(url, fileName, null)
            }
          }
        }
      )
      setOnTouchListener { v, event ->
        gestureDetector.onTouchEvent(event)
        if (event.action == MotionEvent.ACTION_DOWN) {
          v.requestFocus()
        }
        false
      }
      setOnLongClickListener {
        prepareContextMenuTargets()
        false
      }
    }

  init {
    addView(webView)

    val activity = currentActivity
    activity?.registerForContextMenu(webView)

    webView.addJavascriptInterface(NouJsInterface(context, this), "NoraI")

    // some websites have `padding-bottom: env(safe-area-inset-bottom)`, this set it to 0
    // but we need to preserve the IME inset so the WebView resizes when the keyboard opens
    ViewCompat.setOnApplyWindowInsetsListener(webView) { v, insets ->
      val imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime())
      val newInsets = WindowInsetsCompat.Builder()
        .setInsets(WindowInsetsCompat.Type.ime(), imeInsets)
        .build()
      ViewCompat.onApplyWindowInsets(v, newInsets)
      newInsets
    }
  }

  fun load(url: String) {
    if (url == "" || url == "about:blank") return
    val normalizedMessengerUrl = normalizeMessengerUrl(url, pageUrl)
    traceFacebookNavigation("load", pageUrl, url, normalizedMessengerUrl)
    if (normalizedMessengerUrl != null && normalizedMessengerUrl != url) {
      load(normalizedMessengerUrl)
      return
    }
    if (handleExternalAppUrl(context, url)) {
      return
    }
    if (url.startsWith("http://") && !nouController.settings.allowHttpWebsite) {
      showHttpBlockedPage(url)
      return
    }
    pageUrl = url
    var ua = userAgent
    if (url.startsWith("https://www.facebook.com/messages/") ||
      url.startsWith("https://www.tiktok.com")
    ) {
      ua = uaLinux
    } else if (ua == null) {
      ua = uaAndroid
    }
    webView.settings.setUserAgentString(ua)
    webView.loadUrl(url)
  }

  private fun showHttpBlockedPage(url: String) {
    val title = nouController.t("httpBlocked_title")
    val body = nouController.t("httpBlocked_body")
    val html = """
      <html>
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
          body { font-family: sans-serif; padding: 32px 24px; margin: 0; background: #18181b; color: #e4e4e7; }
          h2 { color: #f4f4f5; margin-bottom: 12px; }
          p { line-height: 1.6; color: #a1a1aa; }
          .url { word-break: break-all; background: #27272a; padding: 8px 12px; border-radius: 8px; font-size: 13px; color: #71717a; margin: 16px 0; }
        </style>
      </head>
      <body>
        <h2>$title</h2>
        <div class="url">$url</div>
        <p>$body</p>
      </body>
      </html>
    """.trimIndent()
    webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
  }

  fun setProfile(profile: String) {
    if (profileSet) return
    if (profile == "default") return
    try {
      if (WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
        WebViewCompat.setProfile(webView, profile)
      }
    } catch (e: Exception) {
      log("setProfile failed: ${e.message}")
    }
    profileSet = true
  }

  fun setScriptOnStart(script: String) {
    scriptOnStart = script
  }

  fun download(url: String, fileName: String?, mimeType: String?) {
    val activity = currentActivity
    if (activity == null) {
      return
    }

    CoroutineScope(Dispatchers.IO).launch {
      try {
        val uri = Uri.parse(url)
        val request = DownloadManager.Request(uri)
        var name = fileName
        if (name == null) {
          val mimeTypeMap = MimeTypeMap.getSingleton()
          val ext = MimeTypeMap.getFileExtensionFromUrl(url)
          name = uri.getLastPathSegment()
          if (ext == "" && mimeType != null) {
            name += "." + mimeTypeMap.getExtensionFromMimeType(mimeType)
          }
        }
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        val downloadManager = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        downloadManager.enqueue(request)
        activity.runOnUiThread {
          Toast.makeText(context, nouController.t("toast_downloadStarted"), Toast.LENGTH_LONG).show()
        }
      } catch (e: Exception) {
        activity.runOnUiThread {
          Toast.makeText(context, nouController.t("toast_downloadFailed"), Toast.LENGTH_LONG).show()
        }
      }
    }
  }

  fun saveFile(content: String, _fileName: String, _mimeType: String?) {
    val activity = currentActivity
    if (activity == null) {
      return
    }

    CoroutineScope(Dispatchers.IO).launch {
      val resolver = context.contentResolver
      var uri: Uri? = null
      try {
        val bytes = Base64.getDecoder().decode(content)
        var mimeType = _mimeType
        if (mimeType == null || mimeType == "application/octet-stream") {
          val tika = Tika()
          mimeType = tika.detect(bytes)
        }
        var fileName = _fileName
        if (!fileName.contains(".")) {
          val mimeTypeMap = MimeTypeMap.getSingleton()
          fileName += "." + mimeTypeMap.getExtensionFromMimeType(mimeType)
        }
        val contentValues = ContentValues().apply {
          put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
          put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
          put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        }

        uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
        uri?.let {
          resolver.openOutputStream(it)?.use { outputStream ->
            outputStream.write(bytes)
          }
        }
        activity.runOnUiThread {
          Toast.makeText(context, nouController.t("toast_downloadSucceeded"), Toast.LENGTH_LONG).show()
        }
      } catch (e: Exception) {
        e.printStackTrace()
        uri?.let { resolver.delete(it, null, null) }
        activity.runOnUiThread {
          Toast.makeText(context, nouController.t("toast_downloadFailed"), Toast.LENGTH_LONG).show()
        }
      }
    }
  }

  fun log(msg: String) {
    emit("[kotlin]", msg)
  }

  fun emit(type: String, data: Any) {
    val payload = mapOf("type" to type, "data" to data)
    onMessage(mapOf("payload" to payload))
  }
}
