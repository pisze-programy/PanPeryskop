import Foundation

/// Map content category. `.events`/`.live` are the city map (backend `posts.category`);
/// `.trips` is the Wycieczki mode (separate provider, no backend category string).
enum MapCategory: String, CaseIterable, Identifiable {
    case events, live, trips
    var id: String { rawValue }
    /// Pills shown in the bottom category capsule — Live stays hidden from the UI.
    static let visibleCases: [MapCategory] = [.events, .trips]
    var label: String {
        switch self {
        case .events: return "Wydarzenia"
        case .live: return "Live"
        case .trips: return "Wycieczki"
        }
    }
    /// Backend `category` param for /stories — nil for `.trips` (different endpoint).
    var backendCategory: String? {
        switch self {
        case .events: return AppConstants.categoryEvents
        case .live: return AppConstants.categoryLive
        case .trips: return nil
        }
    }
}
