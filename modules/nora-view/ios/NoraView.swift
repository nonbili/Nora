import ExpoModulesCore
import WebKit
import Network

let uaMac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"

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
  private var popupContainer: UIView?
  private var popupWebView: WKWebView?
  private var popupCommittedToGoogleOAuth = false

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

  static func getCookies(profile: String, host: String, completion: @escaping (String) -> Void) {
    let store = dataStore(for: profile).httpCookieStore
    store.getAllCookies { cookies in
      let lowerHost = host.lowercased()
      let parts = cookies
        .filter { c in
          let domain = c.domain.lowercased()
          let normalized = domain.hasPrefix(".") ? String(domain.dropFirst()) : domain
          return lowerHost == normalized || lowerHost.hasSuffix("." + normalized)
        }
        .map { "\($0.name)=\($0.value)" }
      completion(parts.joined(separator: "; "))
    }
  }

  private static func dataStore(for profile: String) -> WKWebsiteDataStore {
    let store: WKWebsiteDataStore
    if profile == "default" {
      store = WKWebsiteDataStore.default()
    } else if #available(iOS 17.0, *) {
      let identifier = profileIdentifier(for: profile)
      store = WKWebsiteDataStore(forIdentifier: identifier)
    } else {
      store = WKWebsiteDataStore.default()
    }
    if #available(iOS 17.0, *) {
      applyProxy(to: store)
    }
    return store
  }

  @available(iOS 17.0, *)
  static func applyProxy(to store: WKWebsiteDataStore) {
    let settings = NouController.shared.settings
    if settings.proxyEnabled && !settings.proxyHost.isEmpty {
      let portValue = UInt16(settings.proxyPort) ?? 0
      guard let port = NWEndpoint.Port(rawValue: portValue) else {
        NouController.shared.log("iOS Proxy error: Invalid port \(settings.proxyPort)")
        return
      }
      let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(settings.proxyHost), port: port)
      let proxyConfig: ProxyConfiguration
      if settings.proxyType == "socks" {
        proxyConfig = ProxyConfiguration(socksv5Proxy: endpoint)
      } else {
        proxyConfig = ProxyConfiguration(httpCONNECTProxy: endpoint)
      }

      store.proxyConfigurations = [proxyConfig]
      NouController.shared.log("iOS Proxy applied: \(settings.proxyType)://\(settings.proxyHost):\(settings.proxyPort)")
    } else {
      store.proxyConfigurations = []
      NouController.shared.log("iOS Proxy cleared")
    }
  }

  static func clearProfileData(_ profile: String, promise: Promise) {
    if profile == "default" {
      WKWebsiteDataStore.default().removeData(
        ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(),
        modifiedSince: .distantPast
      ) {
        promise.resolve(nil)
      }
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

  static func clearHostData(_ profile: String, host: String, promise: Promise) {
    let normalizedHost = host.lowercased()
    let store = dataStore(for: profile)
    let types = WKWebsiteDataStore.allWebsiteDataTypes()
    store.fetchDataRecords(ofTypes: types) { records in
      let matching = records.filter { record in
        let name = record.displayName.lowercased()
        return name == normalizedHost || normalizedHost.hasSuffix("." + name) || name.hasSuffix("." + normalizedHost)
      }
      guard !matching.isEmpty else {
        promise.resolve(nil)
        return
      }
      store.removeData(ofTypes: types, for: matching) {
        promise.resolve(nil)
      }
    }
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

    installGoogleOAuthShim(config.userContentController)

    config.allowsInlineMediaPlayback = true
    config.preferences.javaScriptCanOpenWindowsAutomatically = true
    config.websiteDataStore = NoraView.dataStore(for: profile)

    return config
  }

  private func setupWebView(profile: String) {
    // Remove existing webview if present
    if webView != nil {
      dismissPopup()
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

  private func isGoogleOAuthPopupUrl(_ url: URL) -> Bool {
    guard let host = url.host?.lowercased() else { return false }
    return GOOGLE_AUTH_HOSTS.contains(host)
  }

  private func showPopup(_ popup: WKWebView) {
    let container = UIView(frame: bounds)
    container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    container.backgroundColor = .black

    popup.frame = container.bounds
    popup.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    container.addSubview(popup)

    let closeButton = UIButton(type: .system)
    closeButton.setTitle("X", for: .normal)
    closeButton.setTitleColor(.white, for: .normal)
    closeButton.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
    closeButton.backgroundColor = UIColor.black.withAlphaComponent(0.6)
    closeButton.layer.cornerRadius = 20
    closeButton.translatesAutoresizingMaskIntoConstraints = false
    closeButton.addTarget(self, action: #selector(closePopup), for: .touchUpInside)
    container.addSubview(closeButton)

    NSLayoutConstraint.activate([
      closeButton.topAnchor.constraint(equalTo: container.safeAreaLayoutGuide.topAnchor, constant: 8),
      closeButton.trailingAnchor.constraint(equalTo: container.safeAreaLayoutGuide.trailingAnchor, constant: -8),
      closeButton.widthAnchor.constraint(equalToConstant: 40),
      closeButton.heightAnchor.constraint(equalToConstant: 40),
    ])

    addSubview(container)
    popupContainer = container
    popupWebView = popup
  }

  @objc
  private func closePopup() {
    dismissPopup()
  }

  private func dismissPopup() {
    popupWebView?.stopLoading()
    popupWebView?.navigationDelegate = nil
    popupWebView?.uiDelegate = nil
    popupWebView?.removeFromSuperview()
    popupContainer?.removeFromSuperview()
    popupWebView = nil
    popupContainer = nil
    popupCommittedToGoogleOAuth = false
  }

  deinit {
      NouController.shared.unregister(self)
      dismissPopup()
      webView.removeObserver(self, forKeyPath: "title")
      webView.removeObserver(self, forKeyPath: "url")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    webView.frame = bounds
    popupContainer?.frame = bounds
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
      let urlString = u.absoluteString
      if urlString.hasPrefix("https://www.facebook.com/messages/") ||
        urlString.hasPrefix("https://www.tiktok.com") {
          webView.customUserAgent = uaMac
      } else {
          webView.customUserAgent = userAgent
      }
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
      let scheme = url.scheme?.lowercased() ?? ""
      let isInternalScheme = INTERNAL_SCHEMES.contains(scheme)
      let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true

      if webView == popupWebView && isMainFrame && !popupCommittedToGoogleOAuth {
          if scheme == "about" {
              decisionHandler(.allow)
              return
          }
          if isGoogleOAuthPopupUrl(url) {
              popupCommittedToGoogleOAuth = true
              decisionHandler(.allow)
              return
          }

          emitCustomEvent(type: "new-tab", data: ["url": urlString])
          dismissPopup()
          decisionHandler(.cancel)
          return
      }

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
      if webView == popupWebView {
          return
      }

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

      emitCustomEvent(type: "scroll", data: ["dy": translation, "y": scrollView.contentOffset.y])
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
  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
      guard navigationAction.targetFrame == nil else {
          return nil
      }

      var startsAsGoogleOAuth = false
      if let url = navigationAction.request.url {
          let scheme = url.scheme?.lowercased() ?? ""
          if scheme != "about" && !isGoogleOAuthPopupUrl(url) {
              emitCustomEvent(type: "new-tab", data: ["url": url.absoluteString])
              return nil
          }
          startsAsGoogleOAuth = isGoogleOAuthPopupUrl(url)
      }

      dismissPopup()
      installGoogleOAuthShim(configuration.userContentController)
      let popup = WKWebView(frame: bounds, configuration: configuration)
      popup.navigationDelegate = self
      popup.uiDelegate = self
      popup.allowsBackForwardNavigationGestures = true
      if let ua = userAgent {
          popup.customUserAgent = ua
      }
      showPopup(popup)
      popupCommittedToGoogleOAuth = startsAsGoogleOAuth
      return popup
  }

  func webViewDidClose(_ webView: WKWebView) {
      if webView == popupWebView {
          dismissPopup()
      }
  }

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

                  let openInProfile = UIAction(
                    title: NouController.shared.t("menu_openInProfile"),
                    image: UIImage(systemName: "person.crop.circle")
                  ) { [weak self] _ in
                      self?.emitCustomEvent(type: "open-in-profile", data: ["url": linkUrl])
                  }
                  actions.append(openInProfile)
              }

              return UIMenu(title: "", children: actions + suggestedActions)
          }

          completionHandler(configuration)
      }
  }
}
