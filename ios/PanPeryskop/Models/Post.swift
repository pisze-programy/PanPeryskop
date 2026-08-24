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
    let is_sold_out: Bool?
    let showtimes: [String]?
    var showtime_booking: [ShowtimeBooking]? = nil

    /// Canonical event tags (ids from the /stories/tags catalog) — empty for untagged posts.
    let tags: [String]?
    /// Seed source (external_id prefix: 'kupbilecik', 'going', …). Nil for user posts.
    let source: String?

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    /// Events (category "events") are re-viewable: "seen" is stored but never blocks
    /// or hides them. Live stays one-time.
    var isEvent: Bool { category == "events" }

    /// Seed events encode `Tytuł: HH:MM, Lokalizacja` in the description — parse it
    /// for the calendar/timer panel. `00:00` means the start time is unknown.
    var eventInfo: EventInfo {
        let pattern = #"^(.+?):\s*(\d{1,2}):(\d{2}),\s*(.+)$"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return EventInfo(title: description, time: nil, venue: nil)
        }
        let ns = description as NSString
        if let m = regex.firstMatch(in: description, range: NSRange(location: 0, length: ns.length)) {
            let title = ns.substring(with: m.range(at: 1)).trimmingCharacters(in: .whitespaces)
            let hh = Int(ns.substring(with: m.range(at: 2))) ?? 0
            let mm = Int(ns.substring(with: m.range(at: 3))) ?? 0
            let venue = ns.substring(with: m.range(at: 4)).trimmingCharacters(in: .whitespaces)
            let time = String(format: "%02d:%02d", hh, mm)
            return EventInfo(
                title: title.isEmpty ? description : title,
                time: time == "00:00" ? nil : time,
                venue: venue.isEmpty ? nil : venue
            )
        }
        return EventInfo(title: description, time: nil, venue: nil)
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

    /// Deep booking link for a chosen showtime, composed on the fly from the
    /// provider-specific booking identity. `nil` when the post has no bookable
    /// sessions (callers fall back to `link_url`).
    func bookingURL(for time: String) -> URL? {
        guard let booking = showtime_booking?.first(where: { $0.time == time }) else { return nil }
        switch booking.kind {
        case "helios":
            guard
                let screen = booking.params["screen"],
                let cinema = booking.params["cinema"],
                let itemId = booking.params["itemId"],
                let itemSourceId = booking.params["itemSourceId"],
                let back = link_url
            else { return nil }
            var comps = URLComponents(string: "https://bilety.helios.pl/screen/\(screen)")
            comps?.queryItems = [
                URLQueryItem(name: "cinemaId", value: cinema),
                URLQueryItem(name: "backUrl", value: back),
                URLQueryItem(name: "item_id", value: itemId),
                URLQueryItem(name: "item_source_id", value: itemSourceId),
            ]
            return comps?.url
        case "cinemacity":
            guard let order = booking.params["order"], let cinema = booking.params["cinema"] else { return nil }
            return URL(string: "https://tickets.cinema-city.pl/order/\(order)?lang=pl&x-cinema=\(cinema)")
        case "multikino":
            guard
                let cinemaId = booking.params["cinemaId"],
                let filmId = booking.params["filmId"],
                let sessionId = booking.params["sessionId"]
            else { return nil }
            return URL(string: "https://www.multikino.pl/rezerwacja-biletow/podsumowanie/\(cinemaId)/\(filmId)/\(sessionId)")
        default:
            return nil
        }
    }

    static func == (lhs: Post, rhs: Post) -> Bool { lhs.id == rhs.id }

    enum MediaType: String, Codable {
        case photo, video
    }
}

/// Per-showtime booking identity for cinema events. The app composes the deep
/// booking URL on the fly — the backend never stores links.
struct ShowtimeBooking: Codable, Equatable {
    let time: String
    let kind: String
    let params: [String: String]
}

struct PostListResponse: Codable {
    let stories: [Post]
}

/// Canonical event tag offered by the map filter chips (backend order).
struct TagPill: Codable, Equatable, Identifiable {
    let id: String
    let label: String
}

struct TagsResponse: Codable {
    let tags: [TagPill]
}

/// Parsed seed-event details (from the `Tytuł: HH:MM, Lokalizacja` description).
struct EventInfo {
    let title: String
    let time: String?
    let venue: String?
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
