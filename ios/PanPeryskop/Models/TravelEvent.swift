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

    var id: String { "\(provider):\(external_id)" }
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
    let providers: [String]

    var id: String { iata }
}