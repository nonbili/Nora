package expo.modules.noraview

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.jni.JavaScriptObject
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
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
      val item = clip.getItemAt(0)
      val text = item.text.toString()
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

    Function("setLocaleStrings") { v: JavaScriptObject ->
      v.getPropertyNames().forEach {
        nouController.i18nStrings[it] = v[it]!!.getString()
      }
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

      AsyncFunction("loadUrl") { view: NoraView, url: String -> view.load(url) }

      AsyncFunction("saveFile") { view: NoraView, fileName: String, mimeType: String, content: String ->
        view.saveFile(fileName, mimeType, content)
      }
    }
  }
}
