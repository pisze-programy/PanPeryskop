import Foundation
import KeychainAccess

enum APIError: Error {
    case server(statusCode: Int, message: String?)

    var isTooLarge: Bool {
        if case .server(let code, _) = self { return code == 413 }
        return false
    }
}

private struct ServerError: Decodable {
    let error: String
}

struct APIClient {
    static let baseURL = "https://panperyskop-api.dev-4cb.workers.dev"

    static func authHeaders() -> [String: String] {
        var headers = ["Content-Type": "application/json"]
        if let token = try? KeychainAccess.Keychain(service: "com.panperyskop.auth").get("session_token") {
            headers["Authorization"] = "Bearer \(token)"
        }
        return headers
    }

    static func get<T: Decodable>(_ path: String, params: [String: String] = [:]) async throws -> T {
        var components = URLComponents(string: "\(baseURL)\(path)")!
        if !params.isEmpty {
            components.queryItems = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        var request = URLRequest(url: components.url!)
        request.allHTTPHeaderFields = authHeaders()
        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(T.self, from: data)
    }

    static func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        let url = URL(string: "\(baseURL)\(path)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.allHTTPHeaderFields = authHeaders()
        request.httpBody = try JSONEncoder().encode(body)
        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(T.self, from: data)
    }

    static func postEmptyBody<T: Decodable>(_ path: String) async throws -> T {
        let url = URL(string: "\(baseURL)\(path)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.allHTTPHeaderFields = authHeaders()
        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(T.self, from: data)
    }

    static func postEmpty(_ path: String) async throws {
        let url = URL(string: "\(baseURL)\(path)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.allHTTPHeaderFields = authHeaders()
        let (_, _) = try await URLSession.shared.data(for: request)
    }

    static func patch<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        let url = URL(string: "\(baseURL)\(path)")!
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.allHTTPHeaderFields = authHeaders()
        request.httpBody = try JSONEncoder().encode(body)
        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(T.self, from: data)
    }

    static func uploadMedia(
        _ path: String,
        fileData: Data,
        fileName: String,
        mimeType: String,
        thumbData: Data?,
        fields: [String: String]
    ) async throws -> CreatePostResponse {
        let url = URL(string: "\(baseURL)\(path)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"

        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let token = try? KeychainAccess.Keychain(service: "com.panperyskop.auth").get("session_token") {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        var body = Data()
        for (key, value) in fields {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n".data(using: .utf8)!)
        if let thumbData {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"thumb\"; filename=\"thumb.jpg\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
            body.append(thumbData)
            body.append("\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        return try JSONDecoder().decode(CreatePostResponse.self, from: data)
    }

    private static func validate(response: URLResponse?, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard !(200..<300).contains(http.statusCode) else { return }
        let message = (try? JSONDecoder().decode(ServerError.self, from: data))?.error
        throw APIError.server(statusCode: http.statusCode, message: message)
    }

    static func uploadAvatar(_ jpeg: Data) async throws -> String {
        struct AvatarResponse: Codable { let avatar_url: String }
        let url = URL(string: "\(baseURL)/users/avatar")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"

        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let token = try? KeychainAccess.Keychain(service: "com.panperyskop.auth").get("session_token") {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"avatar.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(jpeg)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(AvatarResponse.self, from: data).avatar_url
    }
}
