import Foundation

enum StaysAnchor: String, CaseIterable, Identifiable {
    case event
    case centre
    case airport

    var id: String { rawValue }

    var label: String {
        switch self {
        case .event: return "Przy wydarzeniu"
        case .centre: return "Centrum"
        case .airport: return "Przy lotnisku"
        }
    }

    /// The event point duplicates the airport when the venue geo is the airport,
    /// so it is not offered then.
    static func options(venueIsAirport: Bool) -> [StaysAnchor] {
        venueIsAirport ? allCases.filter { $0 != .event } : allCases
    }
}
