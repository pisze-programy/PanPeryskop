import Foundation

struct MyPost: Codable, Identifiable, Equatable {
    let id: String
    let type: String
    let description: String
    let status: String
    let created_at: Int64
    let likes_count: Int
    let views_count: Int
    let shares_count: Int
    let media_url: String?
    let thumb_url: String?
    let rejection_reason: String?
    let is_expired: Bool
    let is_future: Bool

    static let ttlMs: Int64 = 24 * 3_600_000

    var isPhoto: Bool { type == "photo" }

    var displayStatus: MyPostStatus {
        if status == "rejected" { return .rejected }
        if is_expired || is_future { return .disabled }
        return .published
    }
}

enum MyPostStatus {
    case published
    case rejected
    case disabled

    var label: String {
        switch self {
        case .published: return "Opublikowano"
        case .rejected: return "Odrzucono"
        case .disabled: return "Nieaktywne"
        }
    }
}
