import Foundation

// A request owns its session so proxy edits cannot mutate an in-flight snapshot.
// start/cancel and completion run on the main queue, including cancellation before
// the server has answered. The URLSession's cookie and credential jars stay empty.
internal final class NoraFeedRequests: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  static let shared = NoraFeedRequests()
  private var requests: [String: (token: UUID, task: URLSessionDataTask, session: URLSession)] = [:]

  func start(
    id: String, url: String, method: String, headers: [String: String], body: String?,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) throws {
    guard let target = URL(string: url), ["http", "https"].contains(target.scheme?.lowercased() ?? "") else {
      throw URLError(.unsupportedURL)
    }
    // Never replace a live request, even if a caller supplies a duplicate ID.
    guard requests[id] == nil else { throw URLError(.resourceUnavailable) }
    let token = UUID()
    let configuration = try NoraProxy.shared.sessionConfiguration()
    configuration.httpShouldSetCookies = false
    configuration.httpCookieStorage = nil
    configuration.urlCredentialStorage = nil
    let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    var request = URLRequest(url: target)
    request.httpMethod = method
    request.allHTTPHeaderFields = headers
    request.httpBody = body?.data(using: .utf8)
    request.timeoutInterval = 30
    let task = session.dataTask(with: request) { data, response, error in
      DispatchQueue.main.async {
        if self.requests[id]?.token == token {
          self.requests.removeValue(forKey: id)
        }
        defer { session.finishTasksAndInvalidate() }
        if let error { completion(.failure(error)); return }
        guard let response = response as? HTTPURLResponse else {
          completion(.failure(URLError(.badServerResponse)))
          return
        }
        var headers: [String: String] = [:]
        for (name, value) in response.allHeaderFields {
          headers[String(describing: name).lowercased()] = String(describing: value)
        }
        completion(.success([
          "status": response.statusCode, "url": response.url?.absoluteString ?? url,
          "headers": headers, "body": String(decoding: data ?? Data(), as: UTF8.self),
        ]))
      }
    }
    requests[id] = (token, task, session)
    task.resume()
  }

  func cancel(id: String) {
    requests[id]?.task.cancel()
  }

  func urlSession(
    _ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void
  ) {
    guard let target = request.url, ["http", "https"].contains(target.scheme?.lowercased() ?? "") else {
      completionHandler(nil)
      return
    }
    var next = request
    let source = response.url
    if source?.scheme != target.scheme || source?.host != target.host || source?.port != target.port {
      next.setValue(nil, forHTTPHeaderField: "Cookie")
      next.setValue(nil, forHTTPHeaderField: "Authorization")
    }
    completionHandler(next)
  }
}
