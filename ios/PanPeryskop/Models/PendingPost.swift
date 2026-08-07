import Foundation

/// A post waiting for background upload. Media is stored as files inside the
/// PendingPosts directory; this struct is the persisted index entry.
struct PendingPost: Codable, Identifiable {
    let id: String
    let type: String // "photo" | "video"
    let mediaPath: String
    let thumbPath: String?
    let lat: Double
    let lng: Double
    let description: String
    let createdAt: Int64 // unix ms (time of publish attempt)
    var retryCount: Int
}
