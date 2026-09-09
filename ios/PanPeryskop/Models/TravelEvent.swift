import Foundation

/// Travel event pin (from GET /travel/events) — European events from global
/// providers (espn, worldsmarathons, ...), browsed by week. No media, no moderation.
struct TravelEvent: Codable, Identifiable, Equatable {
    let provider: String
    let external_id: String
    let title: String
    let lat: Double
    let lng: Double
    let city: String
    let country: String
    let start_ms: Int64
    let tag: String
    let link: String?
    /// Nearby airport IATAs (≤200 km) that actually have flights from the chosen
    /// origin around the event day — computed by the backend; nil = not filtered.
    let reachableAirports: [String]?

    var id: String { "\(provider):\(external_id)" }

    /// Home/away team split from the title ("X vs Y"); nil when not a match.
    var home: String? { matchParts?.home }
    var away: String? { matchParts?.away }

    private var matchParts: (home: String, away: String)? {
        let parts = title.split(separator: AppConstants.matchSeparator).map { String($0).trimmingCharacters(in: .whitespaces) }
        guard parts.count >= 2 else { return nil }
        return (parts[0], parts[1])
    }

    /// Kickoff hour "HH:mm" in Europe/Warsaw — derived from start_ms.
    var hour: String {
        AppConstants.hourFormatter.string(from: Date(timeIntervalSince1970: TimeInterval(start_ms) / 1000))
    }
}

struct TravelEventsResponse: Codable {
    let events: [TravelEvent]
}

/// Airport (Wycieczki) — Polish origin airports + European destinations with
/// flight-connection info per provider.
struct Airport: Codable, Identifiable, Hashable {
    let iata: String
    let name: String
    let city: String
    let country: String
    let lat: Double
    let lng: Double

    var id: String { iata }
}

/// Destination reachable from an origin airport — carries which airlines serve it.
struct Destination: Codable, Identifiable, Hashable {
    let iata: String
    let name: String
    let city: String
    let country: String
    let lat: Double
    let lng: Double
    let providers: [Airline]

    var id: String { iata }
}

/// The tapped pin's event set shown in the bottom card — one event or a cluster.
struct EventGroup: Identifiable {
    let events: [TravelEvent]

    var id: String { events[0].id }
    var isGroup: Bool { events.count > 1 }
}

/// Flight availability response (backend FlightWindow): outbound/return day cells.
struct FlightWindowResponse: Codable {
    let outbound: [FlightWindowCell]
    let returning: [FlightWindowCell]
}

struct FlightWindowCell: Codable {
    let date: String
    let hour: String?
    let price: Double?
}