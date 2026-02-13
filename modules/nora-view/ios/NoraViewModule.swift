import ExpoModulesCore
import WebKit

let VIEW_HOSTS = [
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
]

let TRACKING_PARAMS: Set<String> = [
  "utm_source",
  "utm_medium",
  "utm_name",
  "utm_term",
  "utm_content",
  "igsh",
  "xmt"
]

public class NoraViewModule: Module {
  private var clipText = ""

  public func definition() -> ModuleDefinition {
    Name("NoraView")

    Events("log")

    OnStartObserving {
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(self.onPasteboardChanged),
        name: UIPasteboard.changedNotification,
        object: nil
      )
    }

    OnStopObserving {
      NotificationCenter.default.removeObserver(
        self,
        name: UIPasteboard.changedNotification,
        object: nil
      )
    }

    Function("setSettings") { (settings: NoraSettings) in
      NouController.shared.settings = settings
    }

    Function("setLocaleStrings") { (v: [String: Any]) in
      for (key, value) in v {
        if let strValue = value as? String {
          NouController.shared.i18nStrings[key] = strValue
        }
      }
    }

    View(NoraView.self) {
      Prop("scriptOnStart") { (view: NoraView, script: String) in
        view.setScriptOnStart(script)
      }

      Prop("useragent") { (view: NoraView, ua: String) in
        view.userAgent = ua
        view.webView.customUserAgent = ua
      }

      Prop("profile") { (view: NoraView, profile: String) in
        view.setProfile(profile)
      }

      Events("onLoad", "onMessage")

      AsyncFunction("download") { (view: NoraView, url: String, fileName: String?) in
          view.download(url: url, fileName: fileName, mimeType: nil)
      }

      AsyncFunction("executeJavaScript") { (view: NoraView, script: String, promise: Promise) in
        view.webView.evaluateJavaScript(script) { result, error in
          if let error = error {
            promise.reject(error)
          } else {
             if let str = result as? String {
                 promise.resolve(str)
             } else {
                 promise.resolve(String(describing: result ?? "null"))
             }
          }
        }
      }

      AsyncFunction("goBack") { (view: NoraView) in
        if view.webView.canGoBack {
          view.webView.goBack()
        }
      }

      AsyncFunction("loadUrl") { (view: NoraView, url: String) in
        view.load(url: url)
      }

      AsyncFunction("saveFile") { (view: NoraView, fileName: String, mimeType: String, content: String) in
        view.saveFile(content: content, fileName: fileName, mimeType: mimeType)
      }
    }
  }

  @objc
  private func onPasteboardChanged() {
    guard let text = UIPasteboard.general.string, !text.isEmpty else {
      return
    }
    if clipText == text {
      return
    }

    guard let url = URL(string: text), let host = url.host else {
      return
    }

    if VIEW_HOSTS.contains(host) {
      let cleanUrl = removeTrackingParams(urlStr: text)
      if cleanUrl != text {
        clipText = cleanUrl
        UIPasteboard.general.string = cleanUrl
      }
    }
  }

  private func removeTrackingParams(urlStr: String) -> String {
    guard let url = URL(string: urlStr),
          var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
      return urlStr
    }

    guard let queryItems = components.queryItems else {
      return urlStr
    }

    let filteredQueryItems = queryItems.filter { !TRACKING_PARAMS.contains($0.name) }

    if filteredQueryItems.count == queryItems.count {
      return urlStr
    }

    components.queryItems = filteredQueryItems.isEmpty ? nil : filteredQueryItems

    return components.url?.absoluteString ?? urlStr
  }
    
  func log(_ msg: String) {
      sendEvent("log", [
          "msg": msg
      ])
  }

  required public init(appContext: AppContext) {
      super.init(appContext: appContext)
      NouController.shared.logFn = self.log
  }
}
