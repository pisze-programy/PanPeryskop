import Foundation

struct APIClient {
    static let baseURL = "https://panperyskop-api.workers.dev"

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

    static func postEmpty(_ path: String) async throws {
        let url = URL(string: "\(baseURL)\(path)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.allHTTPHeaderFields = authHeaders()
        let (_, _) = try await URLSession.shared.data(for: request)
    }

    static func uploadMedia(
        _ path: String,
        fileData: Data,
        fileName: String,
        mimeType: String,
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
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(CreatePostResponse.self, from: data)
    }
}
