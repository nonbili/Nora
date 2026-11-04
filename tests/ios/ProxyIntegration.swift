// Run on macOS 14+ against the local authenticated HTTP/SOCKS fixture:
// swiftc modules/nora-view/ios/NoraProxy.swift tests/ios/ProxyIntegration.swift -o /tmp/ProxyIntegration
#if os(macOS)
import AppKit
#else
import UIKit
#endif
import Foundation
import WebKit

private struct TestFailure: Error { let message: String }
private func trace(_ message: String) {
  print(message)
  #if os(iOS)
  let file = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("trace.txt")
  let previous = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
  try? (previous + message + "\n").write(to: file, atomically: true, encoding: .utf8)
  #endif
}

private func expect(_ condition: Bool, _ message: String) throws {
  if !condition { throw TestFailure(message: message) }
}

@MainActor
private final class PageProbe: NSObject, WKNavigationDelegate {
  let webView: WKWebView
  private var pending: CheckedContinuation<String, Error>?
  private var requestID = UUID()

  init(store suppliedStore: WKWebsiteDataStore? = nil) {
    let store = suppliedStore ?? .default()
    NoraProxy.shared.apply(to: store)
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = store
    webView = WKWebView(frame: .zero, configuration: configuration)
    super.init()
    webView.navigationDelegate = self
  }

  func load(_ url: URL) async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
      pending = continuation
      let requestID = UUID()
      self.requestID = requestID
      var requestURL = URLComponents(url: url, resolvingAgainstBaseURL: false)!
      requestURL.queryItems = [URLQueryItem(name: "nonce", value: UUID().uuidString)]
      webView.load(URLRequest(url: requestURL.url!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8))
      DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
        guard let self, self.pending != nil, self.requestID == requestID else { return }
        self.finish(.failure(TestFailure(message: "WebView request timed out")))
        self.webView.stopLoading()
      }
    }
  }

  private func finish(_ result: Result<String, Error>) {
    let continuation = pending
    pending = nil
    continuation?.resume(with: result)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    webView.evaluateJavaScript("document.body.innerText") { [weak self] value, error in
      if let error { self?.finish(.failure(error)) }
      else { self?.finish(.success(value as? String ?? "")) }
    }
  }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    finish(.failure(error))
  }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    finish(.failure(error))
  }
}

#if os(macOS)
@main
#endif
private struct ProxyIntegration {
  @MainActor static func main() async {
    #if os(macOS)
    _ = NSApplication.shared
    #endif
    do {
      try await run()
      print("PASS: iOS-shared proxy configuration, URLSession and WebKit")
      exit(0)
    } catch {
      print("FAIL: \(error)")
      exit(1)
    }
  }

  @MainActor private static func apply(_ settings: NoraProxySettings) {
    NoraProxy.shared.update(settings)
    NoraProxy.shared.applyToWebViews()
  }

  private static func fetch(_ url: URL) async throws -> String {
    let session = URLSession(configuration: try NoraProxy.shared.sessionConfiguration())
    defer { session.invalidateAndCancel() }
    let (data, response) = try await session.data(from: url)
    try expect((response as? HTTPURLResponse)?.statusCode == 200, "Expected a successful proxied response")
    return String(decoding: data, as: UTF8.self)
  }

  @MainActor private static func fetchFeed(_ url: URL) async throws -> String {
    let requestID = UUID().uuidString
    return try await withCheckedThrowingContinuation { continuation in
      do {
        try NoraFeedRequests.shared.start(id: requestID, url: url.absoluteString, method: "GET", headers: [:], body: nil) { result in
          continuation.resume(with: result.map { $0["body"] as? String ?? "" })
        }
      } catch { continuation.resume(throwing: error) }
    }
  }

  private static func rejectionCount(_ type: String) async throws -> Int {
    let (data, _) = try await URLSession.shared.data(from: URL(string: "http://127.0.0.1:29844/stats")!)
    let counts = try JSONDecoder().decode([String: Int].self, from: data)
    guard let count = counts[type] else { throw TestFailure(message: "Missing fixture rejection count") }
    return count
  }

  @MainActor fileprivate static func run() async throws {
    guard #available(iOS 17.0, macOS 14.0, *) else { throw TestFailure(message: "macOS 14+ required") }
    for port in ["", "0", "65536", "bad"] {
      let invalid = NoraProxySettings(enabled: true, host: "127.0.0.1", port: port)
      do { try invalid.validate(); throw TestFailure(message: "Invalid proxy accepted") }
      catch is NoraProxyError {}
    }
    var longCredentials = NoraProxySettings(enabled: true, type: "socks", host: "localhost", port: "1080", username: String(repeating: "é", count: 128))
    do { try longCredentials.validate(); throw TestFailure(message: "Overlong UTF-8 credentials accepted") }
    catch is NoraProxyError {}
    longCredentials.username = String(repeating: "é", count: 127)
    try longCredentials.validate()
    let url = URL(string: "http://proxy-verification.invalid/check")!
    let page = PageProbe()
    let profile = PageProbe(store: .nonPersistent())
    for type in ["http", "socks"] {
      var settings = NoraProxySettings(
        enabled: true, type: type, host: "127.0.0.1", port: type == "http" ? "29841" : "29842",
        username: "nora-test", password: "p@ss:/ test"
      )
      apply(settings)
      trace("\(type): starting URLSession success check")
      try expect(try await fetch(url) == "proxy works", "URLSession did not use authenticated \(type)")
      try expect(try await fetchFeed(url) == "proxy works", "Native feed transport did not use authenticated \(type)")
      // Cancellation goes through the same request registry as the Expo bridge.
      let cancelledID = UUID().uuidString
      let cancelled = await withCheckedContinuation { continuation in
        do {
          try NoraFeedRequests.shared.start(id: cancelledID, url: url.absoluteString, method: "GET", headers: [:], body: nil) { result in
            if case .failure(let error) = result { continuation.resume(returning: (error as? URLError)?.code == .cancelled) }
            else { continuation.resume(returning: false) }
          }
          NoraFeedRequests.shared.cancel(id: cancelledID)
        } catch { continuation.resume(returning: false) }
      }
      try expect(cancelled, "Native feed cancellation did not finish")
      let namespaceA = "foreground-" + UUID().uuidString
      let namespaceB = "headless-" + UUID().uuidString
      let isolation = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Bool, Error>) in
        do {
          try NoraFeedRequests.shared.start(id: namespaceB, url: "http://proxy-verification.invalid/slow", method: "GET", headers: [:], body: nil) { result in
            if case .failure(let error) = result { continuation.resume(returning: (error as? URLError)?.code == .cancelled) }
            else { continuation.resume(returning: false) }
          }
          // A duplicate cannot overwrite the outstanding request's cancellation handle.
          do {
            try NoraFeedRequests.shared.start(id: namespaceB, url: url.absoluteString, method: "GET", headers: [:], body: nil) { _ in }
            throw TestFailure(message: "Duplicate request ID replaced a live request")
          } catch is URLError {}
          try NoraFeedRequests.shared.start(id: namespaceA, url: url.absoluteString, method: "GET", headers: [:], body: nil) { _ in
            // Completion of one runtime must leave the other runtime cancellable.
            NoraFeedRequests.shared.cancel(id: namespaceB)
          }
        } catch { continuation.resume(throwing: error) }
      }
      try expect(isolation, "Completion removed another runtime's cancellation handle")
      let newProfile = PageProbe(store: .nonPersistent())
      try expect(!newProfile.webView.configuration.websiteDataStore.proxyConfigurations.isEmpty, "New profile missed current proxy")
      trace("\(type): starting WebKit success check")
      try expect(try await page.load(url).trimmingCharacters(in: .whitespacesAndNewlines) == "proxy works", "WebKit did not use authenticated \(type)")
      try expect(try await profile.load(url).trimmingCharacters(in: .whitespacesAndNewlines) == "proxy works", "Profile WebKit did not use authenticated \(type)")
      try expect(page.webView.configuration.websiteDataStore !== profile.webView.configuration.websiteDataStore, "Profile stores were shared")
      trace("\(type): URLSession and WebKit authenticated")
      settings.password = "wrong"
      apply(settings)
      // WebKit applies proxy changes asynchronously in its network process.
      try await Task.sleep(for: .seconds(1))
      // A new origin forces a fresh tunnel. Changing proxy credentials does
      // not revoke a connection that the proxy already authenticated.
      let rejectedURL = URL(string: "http://\(UUID().uuidString.lowercased()).proxy-verification.invalid/check")!
      trace("\(type): starting URLSession rejection check")
      let beforeSession = try await rejectionCount(type)
      do { _ = try await fetch(rejectedURL); throw TestFailure(message: "URLSession accepted bad credentials") }
      catch is TestFailure { throw TestFailure(message: "URLSession accepted bad credentials") }
      catch {}
      try expect(try await rejectionCount(type) > beforeSession, "Fixture did not reject URLSession credentials")
      trace("\(type): starting WebKit rejection check")
      let beforeWebKit = try await rejectionCount(type)
      do { _ = try await page.load(rejectedURL); throw TestFailure(message: "WebKit accepted bad credentials") }
      catch let failure as TestFailure { throw failure }
      catch {}
      try expect(try await rejectionCount(type) > beforeWebKit, "Fixture did not reject WebKit credentials")
      trace("\(type): both rejected wrong credentials")
    }
    apply(NoraProxySettings(enabled: true, host: "", port: "29841"))
    do { _ = try NoraProxy.shared.sessionConfiguration(); throw TestFailure(message: "Invalid endpoint did not block feeds") }
    catch is NoraProxyError {}
    try expect(!WKWebsiteDataStore.default().proxyConfigurations.isEmpty, "Invalid enabled endpoint fell back to direct")
    try expect(!profile.webView.configuration.websiteDataStore.proxyConfigurations.isEmpty, "Invalid endpoint did not block profile traffic")
    apply(NoraProxySettings())
    try expect(WKWebsiteDataStore.default().proxyConfigurations.isEmpty, "Disabling did not clear WebKit proxy")
    try expect(profile.webView.configuration.websiteDataStore.proxyConfigurations.isEmpty, "Disabling did not clear profile proxy")
    try expect(try NoraProxy.shared.sessionConfiguration().proxyConfigurations.isEmpty, "Disabling did not clear feed proxy")
  }
}

#if os(iOS)
@main
private final class ProxyTestApp: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    let controller = UIViewController()
    let label = UILabel()
    label.numberOfLines = 0
    label.text = "Running proxy integration tests…"
    controller.view = label
    window = UIWindow(frame: UIScreen.main.bounds)
    window?.rootViewController = controller
    window?.makeKeyAndVisible()
    Task { @MainActor in
      let result: String
      do {
        try await ProxyIntegration.run()
        result = "PASS: URLSession and WKWebView HTTP/SOCKS authentication, rejection, invalid endpoints and disabling"
      } catch { result = "FAIL: \(error)" }
      label.text = result
      let file = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("result.txt")
      try? result.write(to: file, atomically: true, encoding: .utf8)
    }
    return true
  }
}
#endif
