import Foundation
import CoreLocation

struct Post: Codable, Identifiable, Equatable {
    let id: String
    let user_id: String
    let type: MediaType
    let lat: Double
    let lng: Double
    let description: String
    let media_key: String?
    let thumb_key: String?
    let created_at: Int64
    let expires_at: Int64
    let likes_count: Int
    let views_count: Int
    let shares_count: Int
    let grid_cell_id: String?
    let liked: Bool
    let watched: Bool
    let author_name: String
    let media_url: String?
    let thumb_url: String?

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    var isExpired: Bool {
        Int64(Date().timeIntervalSince1970 * 1000) > expires_at
    }

    static func == (lhs: Post, rhs: Post) -> Bool { lhs.id == rhs.id }

    enum MediaType: String, Codable {
        case photo, video, text
    }
}

struct PostListResponse: Codable {
    let stories: [Post]
}

struct TextPostRequest: Codable {
    let type: String
    let lat: Double
    let lng: Double
    let description: String
}

struct CreatePostResponse: Codable {
    let id: String
    let type: String
    let status: String
    let created_at: Int64
    let expires_at: Int64
}
