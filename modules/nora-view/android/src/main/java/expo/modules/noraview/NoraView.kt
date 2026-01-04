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

fun shouldNoraOverrideUrlLoading(view: WebView, url: String): Boolean {
  val uri = Uri.parse(url)
  if (uri.host in VIEW_HOSTS ||
    (uri.host?.endsWith(".facebook.com") ?: false) ||
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

  private var gestureDetector = GestureDetectorCompat(context, NoraGestureListener())

  internal val currentActivity: Activity?
    get() = appContext.currentActivity

  override fun onCreateContextMenu(menu: ContextMenu) {
    super.onCreateContextMenu(menu)

    val result = webView.getHitTestResult()
    val url = result.getExtra()
    val activity = currentActivity

    if (
      result.getType() in arrayOf(WebView.HitTestResult.IMAGE_TYPE, WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE) &&
      url != null && activity != null
    ) {
      val onDownload = object : MenuItem.OnMenuItemClickListener {
        override fun onMenuItemClick(item: MenuItem): Boolean {
          download(url, null, "image/jpeg")
          return true
        }
      }
      val onCopyLink = object : MenuItem.OnMenuItemClickListener {
        override fun onMenuItemClick(item: MenuItem): Boolean {
          val clipboardManager = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
          val clipData = ClipData.newPlainText("image", url)
          clipboardManager.setPrimaryClip(clipData)
          return true
        }
      }

      menu.add("Save image").setOnMenuItemClickListener(onDownload)
      menu.add("Copy image link").setOnMenuItemClickListener(onCopyLink)
    }
  }

  inner class NoraGestureListener : GestureDetector.SimpleOnGestureListener() {
    override fun onScroll(e1: MotionEvent?, e2: MotionEvent, distanceX: Float, distanceY: Float): Boolean {
      var dy = distanceY
      if (e1 != null) {
        dy = e2.y - e1.y
      }
      emit("scroll", mapOf("dy" to dy))
      return false
    }
  }

  internal val webView =
    NouWebView(context).apply {
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
      webViewClient =
        object : WebViewClient() {
          override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
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

          override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
            shouldNoraOverrideUrlLoading(view, url)
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
      setOnTouchListener(object : OnTouchListener {
        override fun onTouch(v: View, event: MotionEvent): Boolean = gestureDetector.onTouchEvent(event)
      })
    }

  init {
    addView(webView)

    val activity = currentActivity
    activity?.registerForContextMenu(webView)

    webView.addJavascriptInterface(NouJsInterface(context, this), "NoraI")
  }

  fun load(url: String) {
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

  fun setScriptOnStart(script: String) {
    scriptOnStart = script
  }

  fun download(url: String, fileName: String?, mimeType: String?) {
    val activity = currentActivity
    if (activity == null) {
      return
    }

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
    Toast.makeText(context, "Download started, check the system notification", Toast.LENGTH_LONG).show()
  }

  fun saveFile(content: String, _fileName: String, _mimeType: String?) {
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

    val resolver = context.contentResolver
    var uri: Uri? = null
    try {
      uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
      uri?.let {
        resolver.openOutputStream(it)?.use { outputStream ->
          val bytes = Base64.getDecoder().decode(content)
          val tika = Tika()
          val type = tika.detect(bytes)
          outputStream.write(Base64.getDecoder().decode(content))
        }
      }
      Toast.makeText(context, "Saved to the Downloads folder", Toast.LENGTH_LONG).show()
    } catch (e: Exception) {
      e.printStackTrace()
      uri?.let { resolver.delete(it, null, null) }
      Toast.makeText(context, "Failed to download", Toast.LENGTH_LONG).show()
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
