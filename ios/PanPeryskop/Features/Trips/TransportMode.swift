import Foundation

/// How the user reaches the event. Flight is the default.
enum TransportMode: String, CaseIterable, Identifiable {
    case flight
    case bus

    var id: String { rawValue }

    var label: String {
        switch self {
        case .flight: return "Samolot"
        case .bus: return "Bus"
        }
    }
}
