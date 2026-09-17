import CoreLocation

struct StaysAnchorPoint {
    let lat: Double?
    let lng: Double?
    let address: String?

    var key: String { "\(lat ?? 0)|\(lng ?? 0)|\(address ?? "")" }

    var coordinate: CLLocationCoordinate2D? {
        guard let lat, let lng else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    static func resolve(
        _ anchor: StaysAnchor,
        event: TravelEvent,
        airportCoordinate: CLLocationCoordinate2D?
    ) -> StaysAnchorPoint {
        switch anchor {
        case .event:
            return StaysAnchorPoint(lat: event.lat, lng: event.lng, address: nil)
        case .centre:
            return StaysAnchorPoint(lat: nil, lng: nil, address: "\(event.city), \(event.country)")
        case .airport:
            guard let airportCoordinate else {
                return StaysAnchorPoint(lat: event.lat, lng: event.lng, address: nil)
            }
            return StaysAnchorPoint(
                lat: airportCoordinate.latitude,
                lng: airportCoordinate.longitude,
                address: nil
            )
        }
    }
}
