import Foundation

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
    /// Provider extras as a JSON string (runs: distance/surface/time/price; nil for soccer).
    let meta: String?
    /// Nearby airport IATAs (≤200 km) that actually have flights from the chosen
    /// origin around the event day — computed by the backend; nil = not filtered.
    let reachableAirports: [String]?

    var id: String { "\(provider):\(external_id)" }

    var isRun: Bool { tag == AppConstants.runTag }

    var metaData: TravelEventMeta? {
        guard let meta, let data = meta.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(TravelEventMeta.self, from: data)
    }

    var home: String? { matchParts?.home }
    var away: String? { matchParts?.away }

    private var matchParts: (home: String, away: String)? {
        let parts = title.split(separator: AppConstants.matchSeparator).map { String($0).trimmingCharacters(in: .whitespaces) }
        guard parts.count >= 2 else { return nil }
        return (parts[0], parts[1])
    }

    /// Hero/timeline hour from the backend: the venue's local time. nil = none.
    var displayTime: String? { metaData?.time }

    /// Venue local date from the backend; falls back to the stored date.
    var displayDate: Date {
        if let raw = metaData?.date, let parsed = AppConstants.isoDayFormatter.date(from: raw) {
            return parsed
        }
        return Date(timeIntervalSince1970: TimeInterval(start_ms) / 1000)
    }
}

struct TravelEventsResponse: Codable {
    let events: [TravelEvent]
}

struct TravelEventMeta: Decodable {
    let distance: String?
    let distances: [String]?
    let surface: String?
    let difficulty: String?
    let price: String?
    let time: String?
    let date: String?
    let website: String?
    let countryCode: String?
}

struct Airport: Codable, Identifiable, Hashable {
    let iata: String
    let name: String
    let city: String
    let country: String
    let lat: Double
    let lng: Double

    var id: String { iata }
}

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

struct EventGroup: Identifiable {
    let events: [TravelEvent]

    var id: String { events[0].id }
    var isGroup: Bool { events.count > 1 }
}

struct FlightWindowResponse: Codable {
    let outbound: [FlightWindowCell]
    let returning: [FlightWindowCell]
}

struct FlightWindowCell: Codable {
    let date: String
    let hour: String?
    let price: Double?
}

extension FlightWindowCell {
    var cell: FlightCell? {
        guard let price, let date = AppConstants.isoDayFormatter.date(from: date) else { return nil }
        return FlightCell(date: date, hour: hour, price: price)
    }
}