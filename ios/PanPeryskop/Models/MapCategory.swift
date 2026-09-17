import Foundation

/// Map content category. `.events` is the city map (backend `posts.category`);
/// `.trips` is the Wycieczki mode (separate provider, no backend category string).
enum MapCategory: String, CaseIterable, Identifiable {
    case events, trips
    var id: String { rawValue }
}
