package expo.modules.noraview

import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NoraViewModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NoraView")

    OnActivityResult { activity, payload ->
      nouController.onActivityResult(payload.requestCode, payload.resultCode, payload.data)
    }

    View(NoraView::class) {
      Prop("url") { view: NoraView, url: String ->
        view.webView.loadUrl(url)
      }
      Prop("scriptOnStart") { view: NoraView, script: String ->
        view.setScriptOnStart(script)
      }
      Events("onLoad", "onMessage")

      AsyncFunction("eval") Coroutine { view: NoraView, script: String ->
        return@Coroutine view.webView.eval(script)
      }
    }
  }
}
