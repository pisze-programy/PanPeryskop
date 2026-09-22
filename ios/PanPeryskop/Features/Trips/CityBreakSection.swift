import Foundation
enum CityBreakSection: String, CaseIterable, Identifiable {
    case hero
    case flights
    case facts
    case weather
    case cityEvents
    case nearby
    case stays
    case places
    case partners
    case sources

    var id: String { rawValue }

    static func sections(for city: TravelCity) -> [CityBreakSection] {
        var out: [CityBreakSection] = [.hero, .flights, .facts, .weather, .cityEvents]
        if !city.nearby.isEmpty { out.append(.nearby) }
        out.append(contentsOf: [.stays, .places, .partners, .sources])
        return out
    }
}
