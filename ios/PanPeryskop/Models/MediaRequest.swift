import Foundation
import CoreLocation

/// A "media request" pin — a "?" drop pin asking others in the area for a live view.
/// Not clickable, not deletable, TTL 4h, max 1 per 30 min per user.
struct MediaRequest: Codable, Identifiable, Equatable {
    let id: String
    let user_id: String
    let lat: Double
    let lng: Double
    let created_at: Int64

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    static let ttlMs: Int64 = 4 * 3_600_000

    var isExpired: Bool {
        created_at < Int64(Date().timeIntervalSince1970 * 1000) - Self.ttlMs
    }

    var isFutureDated: Bool {
        created_at > Int64(Date().timeIntervalSince1970 * 1000)
    }

    var isStillValid: Bool {
        !isExpired && !isFutureDated
    }

    var ageHours: Double {
        Double(Date().timeIntervalSince1970 - TimeInterval(created_at) / 1000) / 3600
    }

    static func == (lhs: MediaRequest, rhs: MediaRequest) -> Bool { lhs.id == rhs.id }
}

struct MediaRequestListResponse: Codable {
    let requests: [MediaRequest]
}

struct CreateMediaRequestResponse: Codable {
    let request: MediaRequest
}

/// Server 429 cooldown payload: `{ error: 'cooldown', retry_after_min: N }`.
struct MediaRequestCooldown: Codable {
    let retry_after_min: Int?
}
