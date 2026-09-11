import Foundation
import KeychainAccess

// MARK: - Auth / profile / diagnostics

extension APIClient {
    static func uploadAvatar(_ jpeg: Data) async throws -> String {
        struct AvatarResponse: Codable { let avatar_url: String }
        let file = MultipartFile(name: "file", filename: "avatar.jpg", mimeType: "image/jpeg", data: jpeg)
        let response: AvatarResponse = try await http.upload("/users/avatar", fields: [:], files: [file])
        return response.avatar_url
    }

    /// Best-effort report to the backend DLQ (`POST /client/errors`) — used for
    /// background-upload failures and stale drops. Never throws.
    static func reportClientError(errorType: String, message: String, meta: [String: Any]? = nil) async {
        let deviceId = (try? KeychainAccess.Keychain(service: "com.panperyskop.auth").get("device_id")) ?? "unknown"
        var body: [String: Any] = [
            "device_id": deviceId,
            "error_type": errorType,
            "message": message,
        ]
        if let meta { body["meta"] = meta }
        guard let httpBody = try? JSONSerialization.data(withJSONObject: body) else { return }

        var request = URLRequest(url: URL(string: "\(baseURL)/client/errors")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = httpBody
        _ = try? await URLSession.shared.data(for: request)
    }
}