import CoreLocation
import Foundation

enum AirportDirections {
    static func distanceKm(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> Int {
        let meters = CLLocation(latitude: from.latitude, longitude: from.longitude)
            .distance(from: CLLocation(latitude: to.latitude, longitude: to.longitude))
        return Int((meters / 1000).rounded())
    }

    static func webURL(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> String {
        "https://www.google.com/maps/dir/?api=1&origin=\(from.latitude),\(from.longitude)&destination=\(to.latitude),\(to.longitude)&travelmode=transit"
    }

    static func googleMapsAppURL(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> URL? {
        URL(string: "comgooglemaps://?saddr=\(from.latitude),\(from.longitude)&daddr=\(to.latitude),\(to.longitude)&directionsmode=transit")
    }
}
