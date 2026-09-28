import Foundation
enum CityBreakSection: String, CaseIterable, Identifiable {
    case hero
    case flights
    case facts
    case cityEvents
    case nearby
    case hotels
    case stays
    case places
    case partners
    case sources

    var id: String { rawValue }

    static func sections(for city: TravelCity) -> [CityBreakSection] {
        var out: [CityBreakSection] = [.hero]
        if !city.seasonMonths.isEmpty { out.append(.hotels) }
        out.append(contentsOf: [.flights, .facts, .cityEvents])
        if !city.nearby.isEmpty { out.append(.nearby) }
        out.append(contentsOf: [.stays, .places, .partners, .sources])
        return out
    }
}
