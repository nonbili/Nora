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


val BLOCK_HOSTS = arrayOf(
  "www.googletagmanager.com",
  "googleads.g.doubleclick.net"
)

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

fun shouldNoraOverrideUrlLoading(view: WebView, url: String): Boolean {
  val uri = Uri.parse(url)
  val host = uri.host
  if (host in VIEW_HOSTS ||
    host == null ||
    (host.endsWith(".facebook.com") && host != "l.facebook.com") ||
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

class NoraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onLoad by EventDispatcher()
  internal val onMessage by EventDispatcher()

  private var scriptOnStart = ""
  private var pageUrl = ""
  private var customView: View? = null
  internal var userAgent: String? = null
  private var profileSet = false

  private var gestureDetector = GestureDetectorCompat(context, NoraGestureListener())

  internal val currentActivity: Activity?
    get() = appContext.currentActivity

  override fun onCreateContextMenu(menu: ContextMenu) {
    super.onCreateContextMenu(menu)

    val result = webView.getHitTestResult()
    val url = result.getExtra()
    val activity = currentActivity

    if (url == null || activity == null) {
      return
    }

    val onCopyLink = object : MenuItem.OnMenuItemClickListener {
      override fun onMenuItemClick(item: MenuItem): Boolean {
        val clipboardManager = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clipData = ClipData.newPlainText("image", url)
        clipboardManager.setPrimaryClip(clipData)
        return true
      }
    }

    if (
      result.getType() in arrayOf(WebView.HitTestResult.IMAGE_TYPE, WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE)
    ) {
      val onDownload = object : MenuItem.OnMenuItemClickListener {
        override fun onMenuItemClick(item: MenuItem): Boolean {
          download(url, null, "image/jpeg")
          return true
        }
      }

      menu.add(nouController.t("menu_saveImage")).setOnMenuItemClickListener(onDownload)
      menu.add(nouController.t("menu_copyImageLink")).setOnMenuItemClickListener(onCopyLink)
    } else if (result.getType() == WebView.HitTestResult.SRC_ANCHOR_TYPE) {
      menu.add(nouController.t("menu_copyLink")).setOnMenuItemClickListener(onCopyLink)
    }
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
            if (
              url.startsWith("https://www.facebook.com/") &&
              !url.startsWith("https://www.facebook.com/messages/")
            ) {
              load(url.replace("www", "m"))
              return
            }
            pageUrl = url
            onLoad(
              mapOf(
                "url" to pageUrl
              )
            )
          }

          override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            pageUrl = url
            evaluateJavascript(scriptOnStart, null)
          }

          override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            if (request.url.host in BLOCK_HOSTS) {
              return WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
            }
            return null
          }

          override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
            if (nouController.settings.redirectToOldReddit && url.startsWith("https://www.reddit.com/")) {
              load(url.replace("www.reddit.com", "old.reddit.com"))
              return true
            }
            val redirectedUrl = redirectFacebookUrl(url)
            if (redirectedUrl != null && !pageUrl.startsWith(redirectedUrl)) {
              load(redirectedUrl)
              return true
            }
            return shouldNoraOverrideUrlLoading(view, url)
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
              "title" to title
            )
          )
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
              val ret = shouldNoraOverrideUrlLoading(view, url)
              if (!ret || !nouController.settings.openExternalLinkInSystemBrowser) {
                log("new-tab: $url")
                emit("new-tab", mapOf("url" to url))
                return true
              }
              return ret
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
