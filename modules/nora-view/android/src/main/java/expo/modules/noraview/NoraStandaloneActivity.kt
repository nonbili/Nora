package expo.modules.noraview

import android.app.Activity
import android.app.ActivityManager
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
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
  }

  private lateinit var webView: NouWebView
  private lateinit var rootView: FrameLayout
  private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
  private var customView: View? = null
  private var customViewCallback: WebChromeClient.CustomViewCallback? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
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

    if (savedInstanceState == null) {
      loadIntent(intent)
    } else {
      webView.restoreState(savedInstanceState)
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
    loadIntent(intent)
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
    installGoogleOAuthShim(webView)
    webView.webViewClient = object : WebViewClient() {
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

  private fun loadIntent(intent: Intent) {
    val url = intent.dataString ?: return finishAndRemoveTask()
    val scheme = Uri.parse(url).scheme?.lowercase()
    if (scheme != "http" && scheme != "https") {
      finishAndRemoveTask()
      return
    }
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
    if (requestCode != FILE_CHOOSER_REQUEST) return
    fileChooserCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
    fileChooserCallback = null
  }

  override fun onSaveInstanceState(outState: Bundle) {
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
    fileChooserCallback?.onReceiveValue(null)
    fileChooserCallback = null
    hideCustomView()
    webView.stopLoading()
    webView.destroy()
    super.onDestroy()
  }
}
