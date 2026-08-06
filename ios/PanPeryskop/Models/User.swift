import Foundation

struct AppUser: Codable {
    let user_id: String
    let session_token: String
    let role: String
    let is_new: Bool
    let avatar_url: String?
    let username: String?
    let auth_provider: String?
}

struct AuthResponse: Codable {
    let session_token: String
    let user_id: String
    let role: String
    let is_new: Bool
    let avatar_url: String?
    let username: String?
    let auth_provider: String?
}

struct MeResponse: Codable {
    let user_id: String
    let device_id: String
    let role: String
    let username: String?
    let avatar_url: String?
    let auth_provider: String?
    let has_apple: Bool?
    let has_google: Bool?
}
