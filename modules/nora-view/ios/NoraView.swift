import ExpoModulesCore
import WebKit

private func extractFacebookProfileID(_ url: URL?) -> String? {
  guard let url else {
    return nil
  }
  let host = url.host?.lowercased() ?? ""
  guard host.hasSuffix("facebook.com") else {
    return nil
  }
  if url.path == "/profile.php",
     let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
     let id = components.queryItems?.first(where: { $0.name == "id" })?.value,
     !id.isEmpty {
    return id
  }
  return nil
}

private func normalizeMessengerURL(_ url: URL, currentURL: URL? = nil, depth: Int = 0) -> String? {
  if depth > 3 {
    return nil
  }
  let scheme = url.scheme?.lowercased() ?? ""
  let host = url.host?.lowercased() ?? ""
  let currentProfileID = extractFacebookProfileID(currentURL)

  if (scheme == "https" || scheme == "http") && (host == "www.messenger.com" || host == "messenger.com") {
    var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    let path = url.path.isEmpty ? "/" : url.path
    components?.scheme = "https"
    components?.host = "www.facebook.com"
    components?.path = path == "/" ? "/messages/" : "/messages\(path)"
    return components?.url?.absoluteString
  }

  if (scheme == "https" || scheme == "http") && (host == "m.me" || host == "www.m.me") {
    let segments = url.pathComponents.filter { $0 != "/" && !$0.isEmpty }
    if segments.isEmpty {
      return "https://www.facebook.com/messages/"
    }
    return "https://www.facebook.com/messages/t/\(segments.joined(separator: "/"))"
  }

  if scheme == "fb-messenger" {
    let segments = url.pathComponents.filter { $0 != "/" && !$0.isEmpty }
    if (host == "user-thread" || host == "user"), let target = currentProfileID ?? segments.last {
      return "https://www.facebook.com/messages/t/\(target)"
    }
    return "https://www.facebook.com/messages/"
  }

  if let components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
    let queryKeys = Set(["u", "url", "href", "link", "target_url", "redirect_uri", "browser_fallback_url"])
    for item in components.queryItems ?? [] {
      guard queryKeys.contains(item.name), let value = item.value, !value.isEmpty else {
        continue
      }
      if let nested = URL(string: value), let normalized = normalizeMessengerURL(nested, currentURL: currentURL, depth: depth + 1) {
        return normalized
      }
      if value.hasPrefix("https://www.facebook.com/messages/") || value.hasPrefix("https://m.facebook.com/messages/") {
        return value
      }
    }
  }

  return nil
}

private func traceFacebookNavigation(_ stage: String, currentURL: String, targetURL: String, normalizedURL: String? = nil) {
  let values = [currentURL, targetURL]
  let shouldLog = values.contains { $0.contains("facebook.com") || $0.contains("messenger.com") } ||
    targetURL.hasPrefix("fb-messenger:") ||
    targetURL.hasPrefix("intent:")
  guard shouldLog else {
    return
  }
  let suffix = normalizedURL.map { ", normalized=\($0)" } ?? ""
  NouController.shared.log("[fb-nav] \(stage) current=\(currentURL) target=\(targetURL)\(suffix)")
}

private func shouldOpenMessengerInNewTab(currentURL: String, normalizedURL: String?) -> Bool {
  guard let normalizedURL, normalizedURL.hasPrefix("https://www.facebook.com/messages/") else {
    return false
  }
  return currentURL.hasPrefix("https://m.facebook.com/") &&
    !currentURL.hasPrefix("https://m.facebook.com/messages/") &&
    !currentURL.hasPrefix("https://www.facebook.com/messages/")
}

class NoraView: ExpoView, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UIScrollViewDelegate, UIGestureRecognizerDelegate {
  let onLoad = EventDispatcher()
  let onMessage = EventDispatcher()

  var webView: WKWebView!
  var scriptOnStart: String = ""
  var userAgent: String?
  var lastTranslationY: CGFloat = 0
  var lastContextMenuLocation: CGPoint?
  var currentProfile: String = "default"
  var appliedBlocklistRuleList: WKContentRuleList?

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

  private static func profileIdentifierKey(for profile: String) -> String {
    "nora_profile_uuid_\(profile)"
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

  static func clearProfileData(_ profile: String, promise: Promise) {
    if profile == "default" {
      promise.resolve(nil)
      return
    }

    if #available(iOS 17.0, *) {
      let dataStore = dataStore(for: profile)
      dataStore.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {
        UserDefaults.standard.removeObject(forKey: profileIdentifierKey(for: profile))
        promise.resolve(nil)
      }
      return
    }

    promise.resolve(nil)
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    NouController.shared.register(self)
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
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.scrollView.delegate = self
    webView.allowsBackForwardNavigationGestures = true
    let longPressRecognizer = UILongPressGestureRecognizer(target: self, action: #selector(handleContextMenuLongPress(_:)))
    longPressRecognizer.cancelsTouchesInView = false
    longPressRecognizer.delegate = self
    webView.addGestureRecognizer(longPressRecognizer)

    if let ua = userAgent {
      webView.customUserAgent = ua
    }

    addSubview(webView)
    applyBlocklist(NouController.shared.blocklistRuleList)

    // Observe title and URL changes
    webView.addObserver(self, forKeyPath: "title", options: .new, context: nil)
    webView.addObserver(self, forKeyPath: "url", options: .new, context: nil)
  }

  deinit {
      NouController.shared.unregister(self)
      webView.removeObserver(self, forKeyPath: "title")
      webView.removeObserver(self, forKeyPath: "url")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    webView.frame = bounds
  }

  func setInspectable(_ inspectable: Bool) {
    if #available(iOS 16.4, *) {
      webView.isInspectable = inspectable
    }
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

  func applyBlocklist(_ ruleList: WKContentRuleList?) {
      guard webView != nil else {
          appliedBlocklistRuleList = ruleList
          return
      }
      let controller = webView.configuration.userContentController
      if let current = appliedBlocklistRuleList {
          controller.remove(current)
      }
      appliedBlocklistRuleList = ruleList
      if let ruleList = ruleList {
          controller.add(ruleList)
      }
  }

  func load(url: String) {
      guard let u = URL(string: url) else { return }
      if let normalized = normalizeMessengerURL(u, currentURL: webView.url), normalized != url {
          traceFacebookNavigation("load", currentURL: webView.url?.absoluteString ?? "", targetURL: url, normalizedURL: normalized)
          load(url: normalized)
          return
      }
      traceFacebookNavigation("load", currentURL: webView.url?.absoluteString ?? "", targetURL: url)
      var request = URLRequest(url: u)
      webView.load(request)
  }

  // MARK: - KVO
  override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey : Any]?, context: UnsafeMutableRawPointer?) {
      if keyPath == "title" || keyPath == "url" {
          onLoad([
            "canGoBack": webView.canGoBack,
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
      let currentURL = webView.url?.absoluteString ?? ""
      let normalizedMessengerURL = normalizeMessengerURL(url, currentURL: webView.url)
      traceFacebookNavigation("policy", currentURL: currentURL, targetURL: urlString, normalizedURL: normalizedMessengerURL)
      if let normalized = normalizedMessengerURL, normalized != urlString {
          decisionHandler(.cancel)
          if shouldOpenMessengerInNewTab(currentURL: currentURL, normalizedURL: normalized) {
              traceFacebookNavigation("policy-new-tab", currentURL: currentURL, targetURL: urlString, normalizedURL: normalized)
              emitCustomEvent(type: "new-tab", data: ["url": normalized])
              return
          }
          load(url: normalized)
          return
      }
      let scheme = url.scheme?.lowercased() ?? ""
      let isInternalScheme = INTERNAL_SCHEMES.contains(scheme)

      // Redirect to Old Reddit if setting is enabled
      if NouController.shared.settings.redirectToOldReddit && urlString.hasPrefix("https://www.reddit.com/") {
          let oldRedditUrl = urlString.replacingOccurrences(of: "www.reddit.com", with: "old.reddit.com")
          decisionHandler(.cancel)
          load(url: oldRedditUrl)
          return
      }

      if !isInternalScheme {
          if UIApplication.shared.canOpenURL(url) {
              UIApplication.shared.open(url)
          }
          decisionHandler(.cancel)
          return
      }

      let host = url.host ?? ""
      let isFacebook = host.hasSuffix(".facebook.com") && host != "l.facebook.com"

      let isGoogle = host.contains("google.com") || host.contains("gstatic.com") || host.contains("recaptcha.net")
      let dynamicInternalHosts = Set(NouController.shared.settings.internalHosts.map { $0.lowercased() })
      let isDynamicInternalHost = dynamicInternalHosts.contains(host.lowercased())
      let allowedInView =
        VIEW_HOSTS.contains(host) ||
        isDynamicInternalHost ||
        isFacebook ||
        isGoogle ||
        !NouController.shared.settings.openExternalLinkInSystemBrowser

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
        "canGoBack": webView.canGoBack,
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

  @objc
  func handleContextMenuLongPress(_ recognizer: UILongPressGestureRecognizer) {
      if recognizer.state == .began {
          lastContextMenuLocation = recognizer.location(in: webView)
      }
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
      true
  }

  private func resolveContextMenuTargets(
    elementInfo: WKContextMenuElementInfo,
    completion: @escaping (_ linkUrl: String?, _ imageUrl: String?) -> Void
  ) {
      let fallbackLinkUrl = elementInfo.linkURL?.absoluteString
      guard let location = lastContextMenuLocation else {
          completion(fallbackLinkUrl, nil)
          return
      }

      let script = """
        (() => {
          const element = document.elementFromPoint(\(location.x), \(location.y));
          const image = element?.closest?.('img');
          const link = element?.closest?.('a[href]');
          return JSON.stringify({
            imageUrl: image ? (image.currentSrc || image.src || null) : null,
            linkUrl: link ? link.href : null
          });
        })();
      """

      webView.evaluateJavaScript(script) { result, error in
          var linkUrl = fallbackLinkUrl
          var imageUrl: String?

          if
            error == nil,
            let payload = result as? String,
            let data = payload.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
          {
              if let resolvedLinkUrl = json["linkUrl"] as? String, !resolvedLinkUrl.isEmpty {
                  linkUrl = resolvedLinkUrl
              }
              if let resolvedImageUrl = json["imageUrl"] as? String, !resolvedImageUrl.isEmpty {
                  imageUrl = resolvedImageUrl
              }
          }

          completion(linkUrl, imageUrl)
      }
  }

  func emitCustomEvent(type: String, data: Any) {
     let payload: [String: Any] = ["type": type, "data": data]
     onMessage([
        "payload": payload
     ])
  }

  // MARK: - WKUIDelegate
  @available(iOS 15.0, *)
  func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
      decisionHandler(.grant)
  }

  @available(iOS 13.0, *)
  func webView(
    _ webView: WKWebView,
    contextMenuConfigurationForElement elementInfo: WKContextMenuElementInfo,
    completionHandler: @escaping (UIContextMenuConfiguration?) -> Void
  ) {
      resolveContextMenuTargets(elementInfo: elementInfo) { [weak self] linkUrl, imageUrl in
          guard let self = self else {
              completionHandler(nil)
              return
          }
          guard linkUrl != nil || imageUrl != nil else {
              completionHandler(nil)
              return
          }

          let configuration = UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { suggestedActions in
              var actions = [UIMenuElement]()

              if let imageUrl = imageUrl {
                  let openImageInNewTab = UIAction(
                    title: NouController.shared.t("menu_openImageInNewTab"),
                    image: UIImage(systemName: "photo.on.rectangle")
                  ) { [weak self] _ in
                      self?.emitCustomEvent(type: "new-tab", data: ["url": imageUrl, "kind": "image"])
                  }
                  actions.append(openImageInNewTab)
              }

              if let linkUrl = linkUrl, linkUrl != imageUrl {
                  let openInNewTab = UIAction(
                    title: NouController.shared.t("menu_openInNewTab"),
                    image: UIImage(systemName: "plus.square.on.square")
                  ) { [weak self] _ in
                      self?.emitCustomEvent(type: "new-tab", data: ["url": linkUrl])
                  }
                  actions.append(openInNewTab)
              }

              return UIMenu(title: "", children: actions + suggestedActions)
          }

          completionHandler(configuration)
      }
  }
}
