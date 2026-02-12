import ExpoModulesCore

struct NoraSettings: Record {
  @Field
  var openExternalLinkInSystemBrowser: Bool = false

  @Field
  var redirectToOldReddit: Bool = false
}

class NouController {
  static let shared = NouController()

  var settings = NoraSettings()
  var i18nStrings: [String: String] = [:]
  var logFn: ((String) -> Void)?

  func log(_ msg: String) {
    logFn?(msg)
  }

  func t(_ key: String) -> String {
    return i18nStrings[key] ?? "Missed translation: \(key)"
  }
}
