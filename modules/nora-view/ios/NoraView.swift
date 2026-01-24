import ExpoModulesCore
import WebKit

class NoraView: ExpoView, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UIScrollViewDelegate {
  let onLoad = EventDispatcher()
  let onMessage = EventDispatcher()
    
  var webView: WKWebView!
  var scriptOnStart: String = ""
  var userAgent: String?
  var lastTranslationY: CGFloat = 0
  
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
      
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
      
    config.allowsInlineMediaPlayback = true
      
    webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.scrollView.delegate = self
    webView.allowsBackForwardNavigationGestures = true
      
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
                  "payload": [
                      "type": "onMessage", // Usually implied? Android wraps: mapOf("payload" to payload) where payload is string.
                      // Wait, Android: onMessage(mapOf("payload" to payload))
                      // JS side receives event.nativeEvent.payload
                      // The payload string ITSELF is often JSON.
                  ]
               ])
               
               // Rethink: Android `noraView.onMessage(mapOf("payload" to payload))`
               // Defines event "onMessage".
               // The event body is `{ payload: "string" }`.
               
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
      
      let host = url.host ?? ""
      let isFacebook = host.hasSuffix(".facebook.com") && host != "l.facebook.com"
      
      // Check VIEW_HOSTS or basic allow logic
      // Note: VIEW_HOSTS is defined in NoraViewModule.swift or should be shared.
      // I'll redefine it here or access if global. It was `let VIEW_HOSTS` in NoraViewModule.swift file scope? 
      // It was in the file scope of NoraViewModule.swift. I should explicitly import or redefine.
      // Swift files in same module see internal globals. check if it was public/internal. global let is internal by default.
      
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
      
      // Emit scroll event
      // Android: emit("scroll", mapOf("dy" to dy))
      // It passes the event payload to "onMessage" with type "scroll".
      
      emitCustomEvent(type: "scroll", data: ["dy": translation])
  }
    
  func emitCustomEvent(type: String, data: Any) {
     let payload: [String: Any] = ["type": type, "data": data]
     onMessage([
        "payload": payload
     ])
  }
}
