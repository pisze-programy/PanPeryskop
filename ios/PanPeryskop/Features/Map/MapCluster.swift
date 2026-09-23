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

struct ClusterConfig {
    let radiusPixels: Double
    let longitudeScale: Bool
    let anchor: CLLocationCoordinate2D

    static let continental = ClusterConfig(radiusPixels: 48, longitudeScale: false, anchor: CLLocationCoordinate2D(latitude: 0, longitude: 0))
    static let local = ClusterConfig(radiusPixels: 64, longitudeScale: true, anchor: CLLocationCoordinate2D(latitude: 52.0, longitude: 21.0))
}

func clusterItems(_ items: [MapClusterItem], radiusDegrees: Double, config: ClusterConfig = .continental) -> [MapCluster] {
    guard !items.isEmpty, radiusDegrees > 0 else { return [] }
    let radiusLng = config.longitudeScale
        ? radiusDegrees / max(cos(config.anchor.latitude * .pi / 180), 0.01)
        : radiusDegrees
    var buckets: [String: [MapClusterItem]] = [:]
    buckets.reserveCapacity(items.count)
    for item in items {
        let lat = Int(((item.lat - config.anchor.latitude) / radiusDegrees).rounded(.down))
        let lng = Int(((item.lng - config.anchor.longitude) / radiusLng).rounded(.down))
        buckets["\(lat):\(lng)", default: []].append(item)
    }
    return buckets.map { key, group in
        cluster(group, id: key)
    }
}

private func cluster(_ group: [MapClusterItem], id: String) -> MapCluster {
    let lat = group.map(\.lat).reduce(0, +) / Double(group.count)
    let lng = group.map(\.lng).reduce(0, +) / Double(group.count)
    return MapCluster(
        id: id,
        coord: CLLocationCoordinate2D(latitude: lat, longitude: lng),
        items: group
    )
}
