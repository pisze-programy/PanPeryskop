import Foundation

/// The city-break sheet, in the order a traveller decides: the photo, the dates
/// and the fare, the city facts, the weather, what is nearby, then the bookings.
enum CityBreakSection: String, CaseIterable, Identifiable {
    case hero
    case flights
    case facts
    case weather
    case nearby
    case stays
    case places
    case partners
    case sources

    var id: String { rawValue }

    static func sections(for city: TravelCity) -> [CityBreakSection] {
        var out: [CityBreakSection] = [.hero, .flights, .facts, .weather]
        if !city.nearby.isEmpty { out.append(.nearby) }
        out.append(contentsOf: [.stays, .places, .partners, .sources])
        return out
    }
}
