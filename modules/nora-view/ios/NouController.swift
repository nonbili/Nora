import ExpoModulesCore
import WebKit
import Network

struct NoraSettings: Record {
  @Field
  var openExternalLinkInSystemBrowser: Bool = false

  @Field
  var redirectToOldReddit: Bool = false

  @Field
  var internalHosts: [String] = []

  @Field
  var proxyEnabled: Bool = false

  @Field
  var proxyType: String = "http"

  @Field
  var proxyHost: String = ""

  @Field
  var proxyPort: String = ""
}

struct NoraBlocklist: Record {
  @Field
  var enabled: Bool = false

  @Field
  var blockedHosts: String = ""

  @Field
  var allowedHosts: String = ""

  @Field
  var revision: Int = 0
}

private struct PersistedBlocklistMatcherSnapshot: Decodable {
  let revision: Int
  let blockedHosts: String
  let allowedHosts: String

  enum CodingKeys: String, CodingKey {
    case revision
    case blockedHosts
    case allowedHosts
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    revision = try container.decode(Int.self, forKey: .revision)
    blockedHosts = try PersistedBlocklistMatcherSnapshot.decodeHosts(container: container, key: .blockedHosts)
    allowedHosts = try PersistedBlocklistMatcherSnapshot.decodeHosts(container: container, key: .allowedHosts)
  }

  private static func decodeHosts(
    container: KeyedDecodingContainer<CodingKeys>,
    key: CodingKeys
  ) throws -> String {
    if let value = try? container.decode(String.self, forKey: key) {
      return value
    }
    if let values = try? container.decode([String].self, forKey: key) {
      return values.joined(separator: "\n")
    }
    throw DecodingError.typeMismatch(
      String.self,
      DecodingError.Context(codingPath: container.codingPath + [key], debugDescription: "Expected string or string array")
    )
  }
}

class NouController {
  static let shared = NouController()

  private let hostfileAddresses: Set<String> = ["0.0.0.0", "127.0.0.1", "::1"]
  private let cosmeticTokens = ["##", "#@#", "#$#", "#?#", "#%#"]
  private let invalidRuleTokens = ["*", "?", "/", "=", ",", "~"]

  var settings = NoraSettings() {
    didSet {
      applyProxy()
    }
  }

  private var lastProxyKey: String?

  private func applyProxy() {
    if #available(iOS 17.0, *) {
      let proxyKey = "\(settings.proxyEnabled)|\(settings.proxyType)|\(settings.proxyHost)|\(settings.proxyPort)"
      if proxyKey == lastProxyKey {
        return
      }
      lastProxyKey = proxyKey
      runOnMain { [weak self] in
        guard let self = self else { return }
        var stores = Set<WKWebsiteDataStore>()
        for view in self.registeredViews.allObjects {
          if let store = view.webView?.configuration.websiteDataStore {
            stores.insert(store)
          }
        }
        stores.insert(WKWebsiteDataStore.default())
        for store in stores {
          NoraView.applyProxy(to: store)
        }
      }
    }
  }

  var blocklist = NoraBlocklist()
  var i18nStrings: [String: String] = [:]
  var logFn: ((String) -> Void)?
  var blocklistRuleList: WKContentRuleList?
  private let blocklistIdentifier = "nora.runtime.blocklist"
  private let blocklistStorageDirectory = "blocklist"
  private let blocklistMatcherFilename = "matcher.json"
  private let blocklistSourceFilenames = [
    "easylist.txt",
    "easyprivacy.txt",
    "brave-firstparty.txt",
    "brave-firstparty-regional.txt"
  ]
  private let registeredViews = NSHashTable<NoraView>.weakObjects()

  private func decodeHosts(_ value: String) -> [String] {
    return value
      .split(separator: "\n", omittingEmptySubsequences: true)
      .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
  }

  func log(_ msg: String) {
    logFn?(msg)
  }

  func t(_ key: String) -> String {
    return i18nStrings[key] ?? "Missed translation: \(key)"
  }

  func register(_ view: NoraView) {
    runOnMain {
      self.registeredViews.add(view)
      view.applyBlocklist(self.blocklistRuleList)
    }
  }

  func unregister(_ view: NoraView) {
    runOnMain {
      self.registeredViews.remove(view)
    }
  }

  func setBlocklist(_ next: NoraBlocklist) {
    blocklist = next
    guard next.enabled, !next.blockedHosts.isEmpty else {
      clearBlocklist()
      return
    }

    let targetRevision = next.revision
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self = self else { return }
      let encoded = self.encodeBlocklist(next)
      runOnMain { [weak self] in
        guard let self = self else { return }
        WKContentRuleListStore.default().compileContentRuleList(
          forIdentifier: self.blocklistIdentifier,
          encodedContentRuleList: encoded
        ) { [weak self] ruleList, error in
          guard let self = self else { return }
          guard self.blocklist.revision == targetRevision, self.blocklist.enabled else {
            return
          }
          if let error = error {
            self.log("blocklist compile failed: \(error.localizedDescription)")
            return
          }
          self.blocklistRuleList = ruleList
          self.applyBlocklist(ruleList)
        }
      }
    }
  }

  func reloadBlocklistFromDisk(enabled: Bool, revision: Int) -> Bool {
    guard enabled else {
      setBlocklist(NoraBlocklist())
      return true
    }

    guard let snapshot = readPersistedBlocklistSnapshot() else {
      clearBlocklist()
      return false
    }
    guard snapshot.revision == revision else {
      log("blocklist snapshot revision mismatch")
      clearBlocklist()
      return false
    }

    setBlocklist(
      NoraBlocklist(
        enabled: true,
        blockedHosts: snapshot.blockedHosts,
        allowedHosts: snapshot.allowedHosts,
        revision: snapshot.revision
      )
    )
    return true
  }

  func reloadBlocklistFromSourceFiles(enabled: Bool, revision: Int) -> Bool {
    guard enabled else {
      setBlocklist(NoraBlocklist())
      return true
    }

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self = self else { return }
      guard let bodies = self.readBlocklistSourceBodies() else {
        self.log("blocklist source files are missing")
        self.clearBlocklist()
        return
      }

      let parsed = self.parseBlocklistSourceBodies(bodies)
      guard !parsed.blockedHosts.isEmpty || !parsed.allowedHosts.isEmpty else {
        self.log("blocklist source files are invalid")
        self.clearBlocklist()
        return
      }

      self.setBlocklist(
        NoraBlocklist(
          enabled: true,
          blockedHosts: parsed.blockedHosts.joined(separator: "\n"),
          allowedHosts: parsed.allowedHosts.joined(separator: "\n"),
          revision: revision
        )
      )
    }
    return true
  }

  private func clearBlocklist() {
    runOnMain {
      self.blocklistRuleList = nil
      self.applyBlocklist(nil)
      WKContentRuleListStore.default().removeContentRuleList(forIdentifier: self.blocklistIdentifier) { _ in }
    }
  }

  private func applyBlocklist(_ ruleList: WKContentRuleList?) {
    runOnMain {
      for view in self.registeredViews.allObjects {
        view.applyBlocklist(ruleList)
      }
    }
  }

  private func readPersistedBlocklistSnapshot() -> PersistedBlocklistMatcherSnapshot? {
    guard let documentDirectory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
      return nil
    }
    let fileURL = documentDirectory
      .appendingPathComponent(blocklistStorageDirectory, isDirectory: true)
      .appendingPathComponent(blocklistMatcherFilename, isDirectory: false)
    guard FileManager.default.fileExists(atPath: fileURL.path) else {
      return nil
    }

    do {
      let data = try Data(contentsOf: fileURL)
      return try JSONDecoder().decode(PersistedBlocklistMatcherSnapshot.self, from: data)
    } catch {
      log("blocklist snapshot read failed: \(error.localizedDescription)")
      return nil
    }
  }

  private func readBlocklistSourceBodies() -> [String]? {
    do {
      guard let documentDirectory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
        return nil
      }
      let directoryURL = documentDirectory.appendingPathComponent(blocklistStorageDirectory, isDirectory: true)
      return try blocklistSourceFilenames.map { filename in
        let fileURL = directoryURL.appendingPathComponent(filename, isDirectory: false)
        return try String(contentsOf: fileURL, encoding: .utf8)
      }
    } catch {
      log("blocklist source read failed: \(error.localizedDescription)")
      return nil
    }
  }

  private func parseBlocklistSourceBodies(_ bodies: [String]) -> (blockedHosts: [String], allowedHosts: [String]) {
    var blockedHosts = Set<String>()
    var allowedHosts = Set<String>()

    for body in bodies {
      body.enumerateLines { line, _ in
        guard let entry = self.extractHost(line) else {
          return
        }
        if entry.allow {
          allowedHosts.insert(entry.host)
        } else {
          blockedHosts.insert(entry.host)
        }
      }
    }

    return (
      blockedHosts: blockedHosts.sorted(),
      allowedHosts: allowedHosts.sorted()
    )
  }

  private func extractHost(_ rawLine: String) -> (host: String, allow: Bool)? {
    var line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
    if line.isEmpty || line.hasPrefix("!") || line.hasPrefix("[") {
      return nil
    }
    if cosmeticTokens.contains(where: { line.contains($0) }) {
      return nil
    }

    let allow = line.hasPrefix("@@")
    if allow {
      line = String(line.dropFirst(2))
    }
    if let optionIndex = line.firstIndex(of: "$") {
      let pattern = String(line[..<optionIndex])
      if !pattern.hasPrefix("||") || !pattern.hasSuffix("^") {
        return nil
      }
      line = pattern
    }

    let hostfileParts = line.split(whereSeparator: \.isWhitespace)
    if hostfileParts.count >= 2, hostfileAddresses.contains(String(hostfileParts[0])) {
      guard let host = normalizeHost(String(hostfileParts[1])) else {
        return nil
      }
      return (host, allow)
    }

    if line.hasPrefix("||"), line.hasSuffix("^") {
      let startIndex = line.index(line.startIndex, offsetBy: 2)
      let endIndex = line.index(before: line.endIndex)
      guard let host = normalizeHost(String(line[startIndex..<endIndex])) else {
        return nil
      }
      return (host, allow)
    }

    guard let host = normalizeHost(line) else {
      return nil
    }
    return (host, allow)
  }

  private func normalizeHost(_ host: String) -> String? {
    let trimmed = host
      .trimmingCharacters(in: CharacterSet(charactersIn: "."))
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()

    if trimmed.isEmpty || trimmed.contains(":") || !trimmed.contains(".") || trimmed.count > 253 {
      return nil
    }
    if invalidRuleTokens.contains(where: { trimmed.contains($0) }) {
      return nil
    }

    for label in trimmed.split(separator: ".") {
      if label.isEmpty || label.count > 63 || label.first == "-" || label.last == "-" {
        return nil
      }
      if !label.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "-" }) {
        return nil
      }
    }

    return trimmed
  }

  private func runOnMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }

  private func encodeBlocklist(_ blocklist: NoraBlocklist) -> String {
    let blockedHosts = decodeHosts(blocklist.blockedHosts)
    let allowedHosts = decodeHosts(blocklist.allowedHosts)
    if blockedHosts.isEmpty && allowedHosts.isEmpty {
      return "[]"
    }

    struct RuleEntry {
      let host: String
      let allow: Bool
      let partCount: Int
    }

    var rules = [RuleEntry]()
    rules.reserveCapacity(blockedHosts.count + allowedHosts.count)
    rules.append(contentsOf: blockedHosts.map { RuleEntry(host: $0, allow: false, partCount: $0.split(separator: ".").count) })
    rules.append(contentsOf: allowedHosts.map { RuleEntry(host: $0, allow: true, partCount: $0.split(separator: ".").count) })
    rules.sort { lhs, rhs in
      if lhs.partCount != rhs.partCount {
        return lhs.partCount < rhs.partCount
      }
      if lhs.allow != rhs.allow {
        return rhs.allow
      }
      return lhs.host < rhs.host
    }

    var serializedRules = [String]()
    serializedRules.reserveCapacity(rules.count)
    for rule in rules {
      let escapedHost = NSRegularExpression.escapedPattern(for: rule.host)
      let pattern = "^[^:]+://([^/]+\\\\.)?\(escapedHost)(?::[0-9]+)?/"
      let actionType = rule.allow ? "ignore-previous-rules" : "block"

      let ruleDict: [String: Any] = [
        "trigger": ["url-filter": pattern],
        "action": ["type": actionType]
      ]

      if let data = try? JSONSerialization.data(withJSONObject: ruleDict),
         let str = String(data: data, encoding: .utf8) {
        serializedRules.append(str)
      }
    }
    return "[\n" + serializedRules.joined(separator: ",\n") + "\n]"
  }

}
