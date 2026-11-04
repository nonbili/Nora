import Foundation
import Network
import WebKit

internal enum NoraProxyError: LocalizedError {
  case requiresIOS17
  case invalidEndpoint
  case credentialsTooLong

  var errorDescription: String? {
    switch self {
    case .requiresIOS17: return "Proxy support requires iOS 17 or later."
    case .invalidEndpoint: return "Enter a valid proxy host and a port from 1 to 65535."
    case .credentialsTooLong: return "SOCKS proxy credentials must each fit in 255 UTF-8 bytes."
    }
  }
}

// Immutable snapshots keep background feed requests and main-thread WebViews
// on the same settings without sharing the mutable Expo Record.
internal struct NoraProxySettings: Equatable, Sendable {
  var enabled = false
  var type = "http"
  var host = ""
  var port = ""
  var username = ""
  var password = ""

  func validate() throws {
    guard enabled else { return }
    guard type == "http" || type == "socks",
      !host.isEmpty, !host.contains(where: { $0.isWhitespace || "/@".contains($0) }),
      let port = UInt16(port), port > 0
    else { throw NoraProxyError.invalidEndpoint }
    if type == "socks", username.utf8.count > 255 || password.utf8.count > 255 {
      throw NoraProxyError.credentialsTooLong
    }
  }

  func validateBrowsing() throws {
    // Preserve the pre-iOS 17 behavior: browsing is direct, and only HTTP
    // feed requests can use the legacy proxy API. Settings explains this limit.
    if #available(iOS 17.0, macOS 14.0, *) { try validate() }
  }

  @available(iOS 17.0, macOS 14.0, *)
  func configurations() throws -> [ProxyConfiguration] {
    try validate()
    guard enabled else { return [] }
    let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: UInt16(port)!)!)
    var proxy = type == "socks"
      ? ProxyConfiguration(socksv5Proxy: endpoint)
      : ProxyConfiguration(httpCONNECTProxy: endpoint)
    proxy.allowFailover = false
    if !username.isEmpty || !password.isEmpty {
      proxy.applyCredential(username: username, password: password)
    }
    return [proxy]
  }
}

internal final class NoraProxy: @unchecked Sendable {
  static let shared = NoraProxy()
  static let didChange = Notification.Name("NoraProxyDidChange")
  private let lock = NSLock()
  private var settings = NoraProxySettings()
  @MainActor private var applied: NoraProxySettings?
  @MainActor private let stores = NSHashTable<WKWebsiteDataStore>.weakObjects()

  func snapshot() -> NoraProxySettings {
    lock.lock()
    defer { lock.unlock() }
    return settings
  }

  func update(_ next: NoraProxySettings) {
    lock.lock()
    settings = next
    lock.unlock()
    DispatchQueue.main.async { self.applyToWebViews() }
  }

  @MainActor
  func applyToWebViews() {
    let next = snapshot()
    guard next != applied else { return }
    applied = next
    apply(to: WKWebsiteDataStore.default())
    for store in stores.allObjects { apply(to: store) }
    NotificationCenter.default.post(name: Self.didChange, object: nil)
  }

  // Profiles have independent cookie stores, but all use the device's proxy.
  @MainActor
  func apply(to store: WKWebsiteDataStore) {
    stores.add(store)
    if #available(iOS 17.0, macOS 14.0, *) {
      do { store.proxyConfigurations = try snapshot().configurations() }
      catch {
        // An incomplete endpoint must not silently send traffic directly.
        var blocked = ProxyConfiguration(httpCONNECTProxy: .hostPort(host: "127.0.0.1", port: 9))
        blocked.allowFailover = false
        store.proxyConfigurations = [blocked]
      }
    }
  }

  func sessionConfiguration() throws -> URLSessionConfiguration {
    let next = snapshot()
    try next.validate()
    let configuration = URLSessionConfiguration.ephemeral
    if #available(iOS 17.0, macOS 14.0, *) {
      configuration.proxyConfigurations = try next.configurations()
    } else if next.enabled {
      guard next.type == "http", next.username.isEmpty, next.password.isEmpty else {
        throw NoraProxyError.requiresIOS17
      }
      configuration.connectionProxyDictionary = [
        "HTTPEnable": 1,
        "HTTPProxy": next.host,
        "HTTPPort": Int(next.port)!,
        "HTTPSEnable": 1,
        "HTTPSProxy": next.host,
        "HTTPSPort": Int(next.port)!,
      ]
    }
    return configuration
  }
}
