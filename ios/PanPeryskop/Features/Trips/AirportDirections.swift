import CoreLocation
import Foundation

enum AirportDirections {
    static func distanceKm(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> Int {
        let meters = CLLocation(latitude: from.latitude, longitude: from.longitude)
            .distance(from: CLLocation(latitude: to.latitude, longitude: to.longitude))
        return Int((meters / 1000).rounded())
    }

    /// "centrum" at the centre, "12 km od centrum" further out. A place in the
    /// middle of town reads as the centre, never as "0 km".
    static func distanceLabel(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> String {
        let km = distanceKm(from: from, to: to)
        return km == 0 ? "centrum" : "\(km) km od centrum"
    }

    static func webURL(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> String {
        "https://www.google.com/maps/dir/?api=1&origin=\(from.latitude),\(from.longitude)&destination=\(to.latitude),\(to.longitude)&travelmode=transit"
    }

    static func googleMapsAppURL(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> URL? {
        URL(string: "comgooglemaps://?saddr=\(from.latitude),\(from.longitude)&daddr=\(to.latitude),\(to.longitude)&directionsmode=transit")
    }
}
