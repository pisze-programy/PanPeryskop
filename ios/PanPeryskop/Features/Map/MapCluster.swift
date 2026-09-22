import MapKit

enum MapClusterItem: Identifiable {
    case post(Post)
    case city(TravelCity)

    var id: String {
        switch self {
        case .post(let post): return "post:\(post.id)"
        case .city(let city): return "city:\(city.id)"
        }
    }

    var post: Post? {
        if case .post(let post) = self { return post }
        return nil
    }

    var city: TravelCity? {
        if case .city(let city) = self { return city }
        return nil
    }

    var lat: Double {
        switch self {
        case .post(let post): return post.lat
        case .city(let city): return city.lat
        }
    }

    var lng: Double {
        switch self {
        case .post(let post): return post.lng
        case .city(let city): return city.lng
        }
    }
}

struct MapCluster: Identifiable {
    let id: String
    let coord: CLLocationCoordinate2D
    let items: [MapClusterItem]

    var count: Int { items.count }
    var posts: [Post] { items.compactMap(\.post) }
    var cities: [TravelCity] { items.compactMap(\.city) }

    var oldestTimedPost: TimeInterval? {
        posts.filter { !$0.isRestaurant }.map { Double($0.created_at) }.min()
    }
}
func clusterItems(_ items: [MapClusterItem], radiusDegrees: Double) -> [MapCluster] {
    guard !items.isEmpty, radiusDegrees > 0 else { return [] }
    var buckets: [String: [MapClusterItem]] = [:]
    buckets.reserveCapacity(items.count)
    for item in items {
        let lat = Int((item.lat / radiusDegrees).rounded(.down))
        let lng = Int((item.lng / radiusDegrees).rounded(.down))
        buckets["\(lat):\(lng)", default: []].append(item)
    }
    return buckets.map { key, group in
        let lat = group.map(\.lat).reduce(0, +) / Double(group.count)
        let lng = group.map(\.lng).reduce(0, +) / Double(group.count)
        return MapCluster(
            id: key,
            coord: CLLocationCoordinate2D(latitude: lat, longitude: lng),
            items: group
        )
    }
}
