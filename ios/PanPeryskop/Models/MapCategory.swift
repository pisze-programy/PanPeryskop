import Foundation

/// Map content category. `.events` is the city map (backend `posts.category`);
/// `.trips` is the Wycieczki mode (separate provider, no backend category string).
enum MapCategory: String, CaseIterable, Identifiable {
    case events, trips
    var id: String { rawValue }
    /// Pills shown in the bottom category capsule.
    static let visibleCases: [MapCategory] = [.events, .trips]
    var label: String {
        switch self {
        case .events: return "Wydarzenia"
        case .trips: return "Wycieczki"
        }
    }
    /// Backend `category` param for /stories — nil for `.trips` (different endpoint).
    var backendCategory: String? {
        switch self {
        case .events: return AppConstants.categoryEvents
        case .trips: return nil
        }
    }
}