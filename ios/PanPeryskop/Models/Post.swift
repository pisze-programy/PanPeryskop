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
    /// Pin look for a travel event (team-colour gradient or run distance colour).
    var travelPin: TravelPinStyle? = nil

    /// Canonical event tags (ids from the /stories/tags catalog) — empty for untagged posts.
    let tags: [String]?
    /// Curated restaurant distinction: "1*" | "2*" | "3*" | "bib". Nil otherwise.
    let distinction: String?
    /// Seed source (external_id prefix: 'kupbilecik', 'going', …). Nil for user posts.
    let source: String?
    /// Provider extras as a JSON string (a club night: lineup, genres, age, …).
    let meta: String?

    /// Club night fields, when the source sent them. Nil for every other post.
    var clubNight: ClubNightMeta? {
        guard let meta, let data = meta.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(ClubNightMeta.self, from: data)
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    /// Events (category "events") are re-viewable: "seen" is stored but never blocks
    /// or hides them. Live stays one-time.
    var isEvent: Bool { category == AppConstants.categoryEvents }

    /// Live user content — the only kind that can be reported. Seeded events and
    /// curated restaurants are editorial, so the report menu never applies.
    var isLive: Bool { (category ?? AppConstants.categoryLive) == AppConstants.categoryLive }

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
                time: time == AppConstants.unknownTime ? nil : time,
                venue: venue.isEmpty ? nil : venue
            )
        }
        return EventInfo(title: description, time: nil, venue: nil)
    }

    static let ttlMs: Int64 = AppConstants.postTTLMs

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

    /// Deep booking/link for a chosen showtime, composed on the fly from the
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
        case "link":
            // Generic per-showtime page URL (ticket providers such as ebilet /
            // kupbilecik whose showtimes live on separate pages). Opened as-is —
            // the same allow-list rules as link_url apply.
            guard let url = booking.params["url"] else { return nil }
            return URL(string: url)
        default:
            return nil
        }
    }

    static func == (lhs: Post, rhs: Post) -> Bool { lhs.id == rhs.id }

    /// Rebuild a copy with mutated engagement/flags — single source for the
    /// otherwise-triplicated field-by-field rebuilds in MapViewModel.
    func with(
        watched: Bool? = nil,
        liked: Bool? = nil,
        disliked: Bool? = nil,
        likesCount: Int? = nil,
        dislikesCount: Int? = nil
    ) -> Post {
        Post(
            id: id, user_id: user_id, type: type,
            lat: lat, lng: lng, description: description,
            media_key: media_key, thumb_key: thumb_key, created_at: created_at,
            likes_count: likesCount ?? likes_count,
            views_count: views_count, shares_count: shares_count,
            dislikes_count: dislikesCount ?? dislikes_count,
            grid_cell_id: grid_cell_id,
            liked: liked ?? self.liked, disliked: disliked ?? self.disliked, watched: watched ?? self.watched,
            author_name: author_name, media_url: media_url, thumb_url: thumb_url,
            author_avatar_url: author_avatar_url,
            is_sponsored: is_sponsored, category: category, link_url: link_url, is_sold_out: is_sold_out, showtimes: showtimes, showtime_booking: showtime_booking, travelPin: travelPin, tags: tags, distinction: distinction, source: source, meta: meta
        )
    }

    /// True for a curated Michelin restaurant (map "restauracje" tag).
    var isRestaurant: Bool { tags?.contains("restauracje") == true }

    /// Michelin star count 1–3. 0 for Bib Gourmand or a non-restaurant post.
    var restaurantStars: Int {
        guard isRestaurant else { return 0 }
        switch distinction {
        case "1*": return 1
        case "2*": return 2
        case "3*": return 3
        default: return 0
        }
    }

    /// Short distinction label for the card. Nil outside restaurants.
    var restaurantAwardLabel: String? {
        switch restaurantStars {
        case 1: return "1 gwiazdka"
        case 2: return "2 gwiazdki"
        case 3: return "3 gwiazdki"
        default: return distinction == "bib" ? "Wyróżnienie" : nil
        }
    }

    /// Restaurant fields parsed from the description ("Name — cuisine · address").
    var restaurantInfo: (name: String, cuisine: String, address: String) {
        let head = description.components(separatedBy: " — ")
        guard head.count == 2 else { return (description, "", "") }
        let tail = head[1].components(separatedBy: " · ")
        return (head[0], tail.first ?? "", tail.count > 1 ? tail[1] : "")
    }

    enum MediaType: String, Codable {
        case photo, video
    }
}

/// Per-showtime booking identity. Cinema kinds let the app compose a deep booking
/// URL; kind "link" carries a FINAL per-showtime page URL that is opened as-is.
/// The backend never stores final links except via the "link" kind's params.url.
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
