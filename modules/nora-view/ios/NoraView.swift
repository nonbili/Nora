import ExpoModulesCore
import WebKit

class NoraView: ExpoView, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UIScrollViewDelegate {
  let onLoad = EventDispatcher()
  let onMessage = EventDispatcher()

  var webView: WKWebView!
  var scriptOnStart: String = ""
  var userAgent: String?
  var lastTranslationY: CGFloat = 0
  var currentProfile: String = "default"

  // MARK: - Profile Data Store

  /// Maps profile name -> UUID stored in UserDefaults for stable identifier mapping
  private static func profileIdentifier(for profile: String) -> UUID {
    let key = "nora_profile_uuid_\(profile)"
    if let uuidString = UserDefaults.standard.string(forKey: key),
       let uuid = UUID(uuidString: uuidString) {
      return uuid
    }
    let uuid = UUID()
    UserDefaults.standard.set(uuid.uuidString, forKey: key)
    return uuid
  }

  private static func dataStore(for profile: String) -> WKWebsiteDataStore {
    if profile == "default" {
      return WKWebsiteDataStore.default()
    }
    if #available(iOS 17.0, *) {
      let identifier = profileIdentifier(for: profile)
      return WKWebsiteDataStore(forIdentifier: identifier)
    } else {
      return WKWebsiteDataStore.default()
    }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    setupWebView(profile: "default")
  }

  private func createConfig(profile: String) -> WKWebViewConfiguration {
    let config = WKWebViewConfiguration()
    config.userContentController.add(self, name: "NoraI")

    // Inject the bridge shim to match Android's NoraI.onMessage
    let bridgeScript = """
      window.NoraI = {
        onMessage: function(payload) {
          window.webkit.messageHandlers.NoraI.postMessage(payload);
        }
      };
    """
    let userScript = WKUserScript(source: bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: false)
    config.userContentController.addUserScript(userScript)

    if !scriptOnStart.isEmpty {
      let startScript = WKUserScript(source: scriptOnStart, injectionTime: .atDocumentEnd, forMainFrameOnly: false)
      config.userContentController.addUserScript(startScript)
    }

    config.allowsInlineMediaPlayback = true
    config.websiteDataStore = NoraView.dataStore(for: profile)

    return config
  }

  private func setupWebView(profile: String) {
    // Remove existing webview if present
    if webView != nil {
      webView.removeObserver(self, forKeyPath: "title")
      webView.removeObserver(self, forKeyPath: "url")
      webView.removeFromSuperview()
    }

    let config = createConfig(profile: profile)

    webView = WKWebView(frame: bounds, configuration: config)
    #if DEBUG
    if #available(iOS 16.4, *) {
      webView.isInspectable = true
    }
    #endif
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.scrollView.delegate = self
    webView.allowsBackForwardNavigationGestures = true

    if let ua = userAgent {
      webView.customUserAgent = ua
    }

    addSubview(webView)

    // Observe title and URL changes
    webView.addObserver(self, forKeyPath: "title", options: .new, context: nil)
    webView.addObserver(self, forKeyPath: "url", options: .new, context: nil)
  }

  deinit {
      webView.removeObserver(self, forKeyPath: "title")
      webView.removeObserver(self, forKeyPath: "url")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    webView.frame = bounds
  }

  func setScriptOnStart(_ script: String) {
      scriptOnStart = script
      let userScript = WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: false)
      webView.configuration.userContentController.addUserScript(userScript)
  }

  func setProfile(_ profile: String) {
    if profile == currentProfile { return }
    currentProfile = profile
    setupWebView(profile: profile)
  }

  func load(url: String) {
      guard let u = URL(string: url) else { return }
      var request = URLRequest(url: u)
      webView.load(request)
  }

  // MARK: - KVO
  override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey : Any]?, context: UnsafeMutableRawPointer?) {
      if keyPath == "title" || keyPath == "url" {
          onLoad([
            "title": webView.title ?? "",
            "url": webView.url?.absoluteString ?? ""
          ])
      }
  }

  // MARK: - WKScriptMessageHandler
  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
      if message.name == "NoraI" {
          if let payload = message.body as? String {
               // Emit as a dictionary with payload key to match Android structure
               onMessage([
                   "payload": payload
               ])
          }
      }
  }

  // MARK: - WKNavigationDelegate
  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
      guard let url = navigationAction.request.url else {
          decisionHandler(.allow)
          return
      }

      let urlString = url.absoluteString

      // Redirect to Old Reddit if setting is enabled
      if NouController.shared.settings.redirectToOldReddit && urlString.hasPrefix("https://www.reddit.com/") {
          let oldRedditUrl = urlString.replacingOccurrences(of: "www.reddit.com", with: "old.reddit.com")
          decisionHandler(.cancel)
          load(url: oldRedditUrl)
          return
      }

      let host = url.host ?? ""
      let isFacebook = host.hasSuffix(".facebook.com") && host != "l.facebook.com"

      let isGoogle = host.contains("google.com") || host.contains("gstatic.com") || host.contains("recaptcha.net")
      let allowedInView = VIEW_HOSTS.contains(host) || host.isEmpty || isFacebook || isGoogle || !NouController.shared.settings.openExternalLinkInSystemBrowser

      let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true

      if allowedInView || !isMainFrame {
          decisionHandler(.allow)
      } else {
          if UIApplication.shared.canOpenURL(url) {
              UIApplication.shared.open(url)
              decisionHandler(.cancel)
          } else {
              decisionHandler(.allow)
          }
      }
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      let url = webView.url?.absoluteString ?? ""
      let title = webView.title ?? ""

      onLoad([
        "url": url,
        "title": title
      ])

      // Signal to fetch icon, matching Android's onReceivedIcon
      emitCustomEvent(type: "icon", data: "")
  }

  func download(url: String, fileName: String?, mimeType: String?) {
      guard let u = URL(string: url) else { return }
      UIApplication.shared.open(u)
  }

  func saveFile(content: String, fileName: String, mimeType: String?) {
      guard let data = Data(base64Encoded: content) else { return }

      let fileManager = FileManager.default
      let docs = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
      let fileUrl = docs.appendingPathComponent(fileName)

      do {
          try data.write(to: fileUrl)
           NouController.shared.log("Saved file to \(fileUrl.path)")

          DispatchQueue.main.async {
               let activityVC = UIActivityViewController(activityItems: [fileUrl], applicationActivities: nil)
               if let topVC = UIApplication.shared.keyWindow?.rootViewController {
                    activityVC.popoverPresentationController?.sourceView = self
                    topVC.present(activityVC, animated: true, completion: nil)
               }
          }
      } catch {
           NouController.shared.log("Failed to save file: \(error)")
      }
  }

  // MARK: - UIScrollViewDelegate
  func scrollViewDidScroll(_ scrollView: UIScrollView) {
      let translation = scrollView.panGestureRecognizer.translation(in: nil).y

      emitCustomEvent(type: "scroll", data: ["dy": translation])
  }

  func emitCustomEvent(type: String, data: Any) {
     let payload: [String: Any] = ["type": type, "data": data]
     onMessage([
        "payload": payload
     ])
  }
}
