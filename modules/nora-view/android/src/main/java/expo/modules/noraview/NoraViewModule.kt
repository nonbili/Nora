package expo.modules.noraview

import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.FileOutputStream
import java.io.FileWriter

class NoraViewModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NoraView")

    OnActivityResult { activity, payload ->
      nouController.onActivityResult(payload.requestCode, payload.resultCode, payload.data)
    }

    Events("onLog")

    Function("setSettings") { settings: NoraSettings ->
      nouController.settings = settings
    }

    View(NoraView::class) {
      Prop("scriptOnStart") { view: NoraView, script: String ->
        view.setScriptOnStart(script)
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
