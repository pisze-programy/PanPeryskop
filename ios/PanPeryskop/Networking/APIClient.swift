import Foundation

/// App backend facade. A thin wrapper over the shared `HTTPClient`; the feature
/// endpoints live in the `APIClient+*.swift` extensions.
struct APIClient {
    static let baseURL = HTTPClient.shared.baseURL
    static let http = HTTPClient.shared

    static func authHeaders() -> [String: String] { http.authHeaders() }

    static func get<T: Decodable>(_ path: String, params: [String: String] = [:]) async throws -> T {
        try await http.get(path, params: params)
    }

    static func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        try await http.post(path, body: body)
    }

    static func postEmptyBody<T: Decodable>(_ path: String) async throws -> T {
        try await http.postEmptyBody(path)
    }

    static func postEmpty(_ path: String) async throws {
        try await http.postEmpty(path)
    }

    static func patch<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        try await http.patch(path, body: body)
    }
}