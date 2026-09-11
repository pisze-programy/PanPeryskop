import CoreLocation

// Map/geo distances (mirror backend / map providers).
extension AppConstants {
    /// Nearby-airport radius.
    static let nearbyAirportRadiusMeters: CLLocationDistance = 200_000
    static let eventsMaxZoomOutDistance: CLLocationDistance = 100_000
    static let tripsMaxZoomOutDistance: CLLocationDistance = 6_000_000
    /// Minimum distance (degrees) between request pins.
    static let requestPinMinDistance: Double = 0.0008
}