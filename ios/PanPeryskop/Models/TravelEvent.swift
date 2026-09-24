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
    /// Per destination IATA: the carriers with a valid window around the event
    /// day. nil = backend did not send it (unenriched or an older backend).
    let reachableCarriers: [String: [String]]?
    /// True when the backend had no venue coordinate and used the city airport.
    var venueIsAirport: Bool? = nil

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

    /// The trip day the backend uses for availability windows.
    var isoDay: String { AppConstants.isoDayFormatter.string(from: displayDate) }

    var nightBeforeCheckin: String {
        guard let day = Calendar.current.date(byAdding: .day, value: -1, to: displayDate) else { return isoDay }
        return AppConstants.isoDayFormatter.string(from: day)
    }
}

struct TravelEventsResponse: Codable {
    let events: [TravelEvent]
    let enriched: Bool?
}

struct TravelEventMeta: Decodable {
    let distance: String?
    let distances: [String]?
    let surface: String?
    let difficulty: String?
    let price: String?
    let time: String?
    let date: String?
    let venue: String?
    let league: String?
    let homeCode: String?
    let awayCode: String?
    let homeColor: String?
    let awayColor: String?
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
    var events: [TravelEvent]
    var cities: [TravelCity] = []

    var id: String { "cluster" }

    var contentId: String {
        events.first?.id ?? cities.first?.id ?? "empty"
    }
}

extension TravelEvent {
    /// "City, Country" with the country in the reader's language. The one source
    /// for every event card (a run or a match), so the country is never shown in
    /// the provider's own language.
    func placeName(language: String) -> String {
        let byCode = metaData?.countryCode.flatMap { CountryNames.name($0, language: language) }
        let countryName = byCode ?? CountryNames.name(forCountry: country, language: language) ?? country
        if city.isEmpty { return countryName }
        if countryName.isEmpty { return city }
        return "\(city), \(countryName)"
    }
}

struct FlightWindowResponse: Codable {
    let outbound: [FlightWindowCell]
    let returning: [FlightWindowCell]
    /// The airports the carrier really flies. Wizzair sells by metro area, so it
    /// may answer a Warsaw request with a Modlin flight and report WMI here.
    let outboundStation: FlightStation?
    let returningStation: FlightStation?
}

struct FlightStation: Codable, Equatable {
    let from: String
    let to: String
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