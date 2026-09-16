import Foundation
import MapKit

struct MapBBox {
    let swLat: Double
    let swLng: Double
    let neLat: Double
    let neLng: Double

    func contains(lat: Double, lng: Double) -> Bool {
        lat >= swLat && lat <= neLat && lng >= swLng && lng <= neLng
    }
}

/// Typed cache key for the merged post cache — replaces the old stringly key.
struct PostsCacheKey: Hashable {
    let category: MapCategory
    let day: String?
    /// Comma-joined tag ids for the current filter; "" = all tags.
    let tags: String
}
