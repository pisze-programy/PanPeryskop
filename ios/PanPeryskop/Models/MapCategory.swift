import Foundation

enum MapCategory: String, CaseIterable, Identifiable {
    case events, trips
    var id: String { rawValue }
    static let visibleCases: [MapCategory] = [.events, .trips]
    var label: String {
        switch self {
        case .events: return "Lokalne"
        case .trips: return "Europa"
        }
    }
}
