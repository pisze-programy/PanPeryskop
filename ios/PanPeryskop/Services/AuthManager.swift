import Foundation
import KeychainAccess

@MainActor
class AuthManager: ObservableObject {
    @Published var isAuthenticated = false
    @Published var sessionToken: String?
    @Published var userId: String?

    private let keychain = Keychain(service: "com.panperyskop.auth")
    private let deviceIdKey = "device_id"
    private let sessionTokenKey = "session_token"
    private var deviceId: String

    init() {
        if let existing = try? keychain.get(deviceIdKey), !existing.isEmpty {
            deviceId = existing
        } else {
            deviceId = "ios_" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
            try? keychain.set(deviceId, key: deviceIdKey)
        }

        if let token = try? keychain.get(sessionTokenKey), !token.isEmpty {
            sessionToken = token
            isAuthenticated = true
        }
    }

    func login() async throws {
        let url = URL(string: "\(APIClient.baseURL)/auth/device")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["device_id": deviceId])

        let (data, _) = try await URLSession.shared.data(for: request)
        let resp = try JSONDecoder().decode(AuthResponse.self, from: data)

        sessionToken = resp.session_token
        userId = resp.user_id
        try? keychain.set(resp.session_token, key: sessionTokenKey)
        isAuthenticated = true
    }

    func logout() {
        sessionToken = nil
        userId = nil
        try? keychain.remove(sessionTokenKey)
        isAuthenticated = false
    }
}
