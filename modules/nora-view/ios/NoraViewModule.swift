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

// Hosts where Google runs WebView-detection for OAuth.
let GOOGLE_AUTH_HOSTS: Set<String> = ["accounts.google.com", "accounts.youtube.com"]

// Masks WebView-only fingerprints that Google's sign-in checks. Mirrors the
// Android shim in modules/nora-view/android. Self-gates on hostname because
// WKUserScript has no per-origin scoping.
let OAUTH_SHIM_SCRIPT = """
  (function() {
    var host = location.hostname;
    if (host !== 'accounts.google.com' && host !== 'accounts.youtube.com') return;
    try {
      Object.defineProperty(navigator, 'webdriver', { get: function() { return undefined; }, configurable: true });
    } catch (e) {}
    try {
      if (!window.chrome) { window.chrome = {}; }
      if (!window.chrome.runtime) { window.chrome.runtime = {}; }
      if (!window.chrome.app) { window.chrome.app = { isInstalled: false }; }
      if (!window.chrome.csi) { window.chrome.csi = function() { return {}; }; }
      if (!window.chrome.loadTimes) { window.chrome.loadTimes = function() { return {}; }; }
    } catch (e) {}
  })();
"""

func installGoogleOAuthShim(_ controller: WKUserContentController) {
  let script = WKUserScript(source: OAUTH_SHIM_SCRIPT, injectionTime: .atDocumentStart, forMainFrameOnly: false)
  controller.addUserScript(script)
}

let INTERNAL_SCHEMES: Set<String> = [
  "about",
  "blob",
  "data",
  "file",
  "http",
  "https",
  "javascript",
  "nora"
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

    Function("setBlocklist") { (blocklist: NoraBlocklist) in
      NouController.shared.setBlocklist(blocklist)
    }

    AsyncFunction("reloadBlocklistFromDisk") { (enabled: Bool, revision: Int) -> Bool in
      NouController.shared.reloadBlocklistFromDisk(enabled: enabled, revision: revision)
    }

    AsyncFunction("reloadBlocklistFromSourceFiles") { (enabled: Bool, revision: Int) -> Bool in
      NouController.shared.reloadBlocklistFromSourceFiles(enabled: enabled, revision: revision)
    }

    Function("setLocaleStrings") { (v: [String: Any]) in
      for (key, value) in v {
        if let strValue = value as? String {
          NouController.shared.i18nStrings[key] = strValue
        }
      }
    }

    AsyncFunction("clearProfileData") { (profile: String, promise: Promise) in
      NoraView.clearProfileData(profile, promise: promise)
    }

    AsyncFunction("clearHostData") { (profile: String, host: String, promise: Promise) in
      NoraView.clearHostData(profile, host: host, promise: promise)
    }

    AsyncFunction("getCookies") { (url: String, profile: String?, promise: Promise) in
      guard let parsed = URL(string: url), let host = parsed.host else {
        promise.resolve("")
        return
      }
      DispatchQueue.main.async {
        NoraView.getCookies(profile: profile ?? "default", host: host) { value in
          promise.resolve(value)
        }
      }
    }

    AsyncFunction("openExternalUrl") { (url: String) -> Bool in
      guard let target = URL(string: url) else {
        return false
      }
      guard UIApplication.shared.canOpenURL(target) else {
        return false
      }
      UIApplication.shared.open(target)
      return true
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

      Prop("inspectable") { (view: NoraView, inspectable: Bool) in
        view.setInspectable(inspectable)
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

      AsyncFunction("canGoBack") { (view: NoraView) in
        view.webView.canGoBack
      }

      AsyncFunction("goForward") { (view: NoraView) in
        if view.webView.canGoForward {
          view.webView.goForward()
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
