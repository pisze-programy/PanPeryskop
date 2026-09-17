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
}
