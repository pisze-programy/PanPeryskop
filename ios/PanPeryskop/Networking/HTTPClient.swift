import Foundation
import KeychainAccess

/// Low-level HTTP transport for the app's backend. Holds the base URL and the
/// session, and owns auth-header injection + status validation. `URLSession` is
/// injectable so tests can use a stub `URLProtocol`.
struct HTTPClient {
    static let shared = HTTPClient()

    let baseURL: String
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(baseURL: String = "https://api.panperyskop.app", session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func authHeaders() -> [String: String] {
        var headers = ["Content-Type": "application/json"]
        if let token = try? KeychainAccess.Keychain(service: "com.panperyskop.auth").get("session_token") {
            headers["Authorization"] = "Bearer \(token)"
        }
        return headers
    }

    private func authorizedRequest(_ path: String, method: String = "GET", params: [String: String] = [:]) -> URLRequest {
        var components = URLComponents(string: "\(baseURL)\(path)")!
        if !params.isEmpty {
            components.queryItems = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.allHTTPHeaderFields = authHeaders()
        return request
    }

    func get<T: Decodable>(_ path: String, params: [String: String] = [:]) async throws -> T {
        let (data, response) = try await session.data(for: authorizedRequest(path, params: params))
        try validate(response: response, data: data)
        return try decoder.decode(T.self, from: data)
    }

    func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        var request = authorizedRequest(path, method: "POST")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return try decoder.decode(T.self, from: data)
    }

    func postEmptyBody<T: Decodable>(_ path: String) async throws -> T {
        let (data, response) = try await session.data(for: authorizedRequest(path, method: "POST"))
        try validate(response: response, data: data)
        return try decoder.decode(T.self, from: data)
    }

    func postEmpty(_ path: String) async throws {
        let (data, response) = try await session.data(for: authorizedRequest(path, method: "POST"))
        try validate(response: response, data: data)
    }

    func patch<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        var request = authorizedRequest(path, method: "PATCH")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return try decoder.decode(T.self, from: data)
    }

    /// POST a raw JSON body (for `[String: Any]` payloads).
    func postRaw<T: Decodable>(_ path: String, json: Any, checkStatus: Bool = false) async throws -> T {
        var request = authorizedRequest(path, method: "POST")
        request.httpBody = try JSONSerialization.data(withJSONObject: json)
        let (data, response) = try await session.data(for: request)
        if checkStatus { try validate(response: response, data: data) }
        return try decoder.decode(T.self, from: data)
    }

    /// POST a raw JSON body and inspect the response (for 429 cooldown handling).
    func postRawData(_ path: String, json: Any) async throws -> (Data, URLResponse) {
        var request = authorizedRequest(path, method: "POST")
        request.httpBody = try JSONSerialization.data(withJSONObject: json)
        return try await session.data(for: request)
    }

    /// Multipart upload. `fields` are form values, `files` are binary parts.
    func upload<T: Decodable>(_ path: String, fields: [String: String], files: [MultipartFile]) async throws -> T {
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let token = try? KeychainAccess.Keychain(service: "com.panperyskop.auth").get("session_token") {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = Self.multipartBody(boundary: boundary, fields: fields, files: files)
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return try decoder.decode(T.self, from: data)
    }

    func validate(response: URLResponse?, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard !(200..<300).contains(http.statusCode) else { return }
        let message = (try? decoder.decode(ServerErrorBody.self, from: data))?.error
        throw APIError.server(statusCode: http.statusCode, message: message)
    }

    private static func multipartBody(boundary: String, fields: [String: String], files: [MultipartFile]) -> Data {
        var body = Data()
        let crlf = "\r\n"
        for (key, value) in fields {
            body.append("--\(boundary)\(crlf)".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\(crlf)\(crlf)".data(using: .utf8)!)
            body.append("\(value)\(crlf)".data(using: .utf8)!)
        }
        for file in files {
            body.append("--\(boundary)\(crlf)".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(file.name)\"; filename=\"\(file.filename)\"\(crlf)".data(using: .utf8)!)
            body.append("Content-Type: \(file.mimeType)\(crlf)\(crlf)".data(using: .utf8)!)
            body.append(file.data)
            body.append(crlf.data(using: .utf8)!)
        }
        body.append("--\(boundary)--\(crlf)".data(using: .utf8)!)
        return body
    }
}

struct MultipartFile {
    let name: String
    let filename: String
    let mimeType: String
    let data: Data

    init(name: String, filename: String, mimeType: String, data: Data) {
        self.name = name
        self.filename = filename
        self.mimeType = mimeType
        self.data = data
    }
}