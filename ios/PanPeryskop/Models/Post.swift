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
    let likes_count: Int
    let views_count: Int
    let shares_count: Int
    let dislikes_count: Int
    let grid_cell_id: String?
    let liked: Bool
    let disliked: Bool
    let watched: Bool
    let author_name: String
    let media_url: String?
    let thumb_url: String?
    let author_avatar_url: String?
    let is_sponsored: Bool?
    let category: String?
    let link_url: String?

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    static let ttlMs: Int64 = 24 * 3_600_000

    /// Server-side visibility window: [created_at, created_at + 24h].
    var isExpired: Bool {
        created_at < Int64(Date().timeIntervalSince1970 * 1000) - Self.ttlMs
    }

    var isFutureDated: Bool {
        created_at > Int64(Date().timeIntervalSince1970 * 1000)
    }

    var isStillValid: Bool {
        !isExpired && !isFutureDated
    }

    var resolvedMediaURL: URL? {
        if let url = media_url { return URL(string: url) }
        if let key = media_key { return URL(string: "\(APIClient.baseURL)/media/\(key)") }
        return nil
    }

    /// Derive the server thumbnail key for posts created before thumbnails existed
    /// (`posts/{id}/media.ext` → `posts/{id}/thumb.jpg` — the backend always stores thumb.jpg).
    private var derivedThumbKey: String? {
        guard let key = media_key, let lastSlash = key.lastIndex(of: "/") else { return nil }
        return String(key[key.startIndex..<lastSlash]) + "/thumb.jpg"
    }

    var resolvedThumbURL: URL? {
        if let url = thumb_url, URL(string: url) != resolvedMediaURL {
            return URL(string: url)
        }
        if let key = thumb_key { return URL(string: "\(APIClient.baseURL)/media/\(key)") }
        if let key = derivedThumbKey { return URL(string: "\(APIClient.baseURL)/media/\(key)") }
        if type == .photo { return resolvedMediaURL }
        return nil
    }

    var hasThumb: Bool {
        resolvedThumbURL != nil
    }

    static func == (lhs: Post, rhs: Post) -> Bool { lhs.id == rhs.id }

    enum MediaType: String, Codable {
        case photo, video
    }
}

struct PostListResponse: Codable {
    let stories: [Post]
}

struct CreatePostResponse: Codable {
    let id: String
    let type: String
    let media_key: String?
    let thumb_key: String?
    let created_at: Int64
    let is_sponsored: Bool?
    let link_url: String?
}
