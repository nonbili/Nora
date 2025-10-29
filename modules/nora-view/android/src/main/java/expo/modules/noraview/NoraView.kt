package expo.modules.noraview

import android.app.Activity
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Environment
import android.util.AttributeSet
import android.view.ContextMenu
import android.view.MenuItem
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JsResult
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.ByteArrayInputStream
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

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

class NouWebView @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null, defStyleAttr: Int = 0) :
  WebView(context, attrs, defStyleAttr) {

  override fun onWindowVisibilityChanged(visibility: Int) {
    super.onWindowVisibilityChanged(VISIBLE)
  }

  init {
    settings.run {
      javaScriptEnabled = true
      domStorageEnabled = true
      mediaPlaybackRequiresUserGesture = false
      supportZoom()
      builtInZoomControls = true
      displayZoomControls = false
    }
    CookieManager.getInstance().setAcceptCookie(true)

    // https://stackoverflow.com/a/64564676
    setFocusable(true)
    setFocusableInTouchMode(true)

    setWebContentsDebuggingEnabled(true)
    addJavascriptInterface(NouJsInterface(context), "NoraI")
  }

  suspend fun eval(script: String): String = suspendCancellableCoroutine { cont ->
    evaluateJavascript(script) { result ->
      if (result != null) {
        cont.resume(result.removeSurrounding("\""), null)
      } else {
        cont.resumeWithException(Exception("evaluateJavascript failed"))
      }
    }
  }
}

class NoraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onLoad by EventDispatcher()
  internal val onMessage by EventDispatcher()

  private var scriptOnStart = ""
  private var pageUrl = ""
  private var customView: View? = null

  private var userAgent: String? = null

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
          val uri = Uri.parse(url)
          val request = DownloadManager.Request(uri)
          request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, uri.getLastPathSegment())

          request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
          val downloadManager = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
          downloadManager.enqueue(request)
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
            val uri = Uri.parse(url)
            if (uri.host in VIEW_HOSTS || (uri.host != null && uri.host!!.endsWith(".facebook.com"))) {
              return false
            } else {
              try {
                view.getContext().startActivity(Intent(Intent.ACTION_VIEW, uri))
              } catch (e: ActivityNotFoundException) {
                // Toast.makeText(context, "No application can handle this url: $url", Toast.LENGTH_LONG).show()
                e.printStackTrace()
              }
              return true
            }
          }
        }

      webChromeClient = object : WebChromeClient() {
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
      }
    }

  init {
    addView(webView)

    userAgent = webView.settings.userAgentString

    val activity = currentActivity
    activity?.registerForContextMenu(webView)

    webView.setOnScrollChangeListener(
      object : View.OnScrollChangeListener {
        override fun onScrollChange(v: View, scrollX: Int, scrollY: Int, oldScrollX: Int, oldScrollY: Int) {
          onMessage(
            mapOf("payload" to """{"type": "scroll", "payload": {"scrollY": $scrollY, "oldScrollY": $oldScrollY}}""")
          )
        }
      }
    )
  }

  fun load(url: String) {
    if (url.startsWith("https://www.facebook.com") ||
      url.startsWith("https://www.tiktok.com")
    ) {
      webView.settings.setUserAgentString(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
      )
    } else {
      webView.settings.setUserAgentString(userAgent)
    }
    webView.loadUrl(url)
  }

  fun setScriptOnStart(script: String) {
    scriptOnStart = script
  }
}
