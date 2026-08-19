import Foundation
import KeychainAccess

@MainActor
class AuthManager: ObservableObject {
    @Published var isAuthenticated = false
    @Published var sessionToken: String?
    @Published var userId: String?
    @Published var authProvider: String?
    @Published var avatarUrl: String? {
        didSet {
            if let avatarUrl {
                UserDefaults.standard.set(avatarUrl, forKey: avatarUrlKey)
            } else {
                UserDefaults.standard.removeObject(forKey: avatarUrlKey)
            }
        }
    }
    @Published var username: String? {
        didSet {
            if let username {
                UserDefaults.standard.set(username, forKey: usernameKey)
            } else {
                UserDefaults.standard.removeObject(forKey: usernameKey)
            }
        }
    }

    /// Bumped on every avatar upload so views can cache-bust the (constant) media URL.
    private var avatarVersion: Int {
        get { UserDefaults.standard.integer(forKey: avatarVersionKey) }
        set { UserDefaults.standard.set(newValue, forKey: avatarVersionKey) }
    }

    /// Fallback shown while no server-assigned username is available yet (e.g. before
    /// the backend ships it). Generated once and cached so it is stable across launches.
    private var cachedFallbackUsername: String {
        if let existing = UserDefaults.standard.string(forKey: fallbackUsernameKey), !existing.isEmpty {
            return existing
        }
        let generated = "Peryskop no.\(String(format: "%04d", Int.random(in: 0...9999)))"
        UserDefaults.standard.set(generated, forKey: fallbackUsernameKey)
        return generated
    }

    var displayUsername: String {
        if let username, !username.isEmpty { return username }
        return cachedFallbackUsername
    }

    /// Avatar URL with a cache-buster suffix; AsyncImage otherwise caches the old image
    /// because the server key (`users/{id}/avatar.jpg`) never changes.
    var avatarDisplayURL: String? {
        guard let avatarUrl else { return nil }
        return "\(avatarUrl)?v=\(avatarVersion)"
    }

    private let keychain = Keychain(service: "com.panperyskop.auth")
    private let deviceIdKey = "device_id"
    private let sessionTokenKey = "session_token"
    private let avatarUrlKey = "avatar_url"
    private let avatarVersionKey = "avatar_version"
    private let usernameKey = "username"
    private let fallbackUsernameKey = "fallback_username"
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

        if let cached = UserDefaults.standard.string(forKey: avatarUrlKey) {
            avatarUrl = cached
        }
        if let cached = UserDefaults.standard.string(forKey: usernameKey) {
            username = cached
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
        authProvider = resp.auth_provider ?? "device"
        avatarUrl = resp.avatar_url
        username = resp.username
        try? keychain.set(resp.session_token, key: sessionTokenKey)
        isAuthenticated = true
    }

    func loginWithApple(_ result: AppleSignInResult) async throws {
        try await performOAuthLogin(
            path: "/auth/apple",
            identityToken: result.identityToken,
            provider: "apple"
        )
    }

    private func performOAuthLogin(path: String, identityToken: String, provider: String) async throws {
        struct OAuthBody: Encodable {
            let device_id: String
            let identity_token: String
            let full_name: String?
        }
        let url = URL(string: "\(APIClient.baseURL)\(path)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(OAuthBody(device_id: deviceId, identity_token: identityToken, full_name: nil))

        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            if http.statusCode == 403 { throw AuthError.banned }
            struct ServerError: Decodable { let error: String? }
            let message = (try? JSONDecoder().decode(ServerError.self, from: data))?.error
            throw AuthError.server(statusCode: http.statusCode, message: message)
        }
        let resp = try JSONDecoder().decode(AuthResponse.self, from: data)

        sessionToken = resp.session_token
        userId = resp.user_id
        authProvider = resp.auth_provider ?? provider
        avatarUrl = resp.avatar_url
        username = resp.username
        try? keychain.set(resp.session_token, key: sessionTokenKey)
        isAuthenticated = true
    }

    func refreshMe() async {
        guard isAuthenticated else { return }
        do {
            let me: MeResponse = try await APIClient.get("/users/me")
            avatarUrl = me.avatar_url
            if let name = me.username, !name.isEmpty {
                username = name
            }
            if let provider = me.auth_provider {
                authProvider = provider
            }
        } catch {
            print("Failed to refresh user:", error)
        }
    }

    func updateUsername(_ name: String) async throws {
        struct UpdateBody: Encodable { let username: String }
        struct UpdateResponse: Decodable { let username: String }
        let resp: UpdateResponse = try await APIClient.patch("/users/me", body: UpdateBody(username: name))
        username = resp.username
    }

    func setAvatarUrl(_ url: String) {
        avatarUrl = url
        avatarVersion += 1
    }

    func logout() async {
        if let token = sessionToken {
            var request = URLRequest(url: URL(string: "\(APIClient.baseURL)/auth/logout")!)
            request.httpMethod = "POST"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            _ = try? await URLSession.shared.data(for: request)
        }
        sessionToken = nil
        userId = nil
        authProvider = nil
        avatarUrl = nil
        username = nil
        try? keychain.remove(sessionTokenKey)
        isAuthenticated = false
    }
}

enum AuthError: LocalizedError, Equatable {
    case banned
    case server(statusCode: Int, message: String?)

    var errorDescription: String? {
        switch self {
        case .banned:
            return "Urządzenie zbanowane"
        case .server(let statusCode, let message):
            return message ?? "Błąd serwera (\(statusCode))"
        }
    }
}
