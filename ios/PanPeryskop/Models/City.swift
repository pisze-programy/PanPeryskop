import Foundation
import MapKit

struct City: Identifiable, Hashable {
    let id: String
    let name: String
    let lat: Double
    let lng: Double
    let span: MKCoordinateSpan

    init(
        id: String,
        name: String,
        lat: Double,
        lng: Double,
        span: MKCoordinateSpan = MKCoordinateSpan(latitudeDelta: 0.10, longitudeDelta: 0.10)
    ) {
        self.id = id
        self.name = name
        self.lat = lat
        self.lng = lng
        self.span = span
    }

    var center: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    var region: MKCoordinateRegion {
        MKCoordinateRegion(center: center, span: span)
    }

    static func == (lhs: City, rhs: City) -> Bool { lhs.id == rhs.id }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}
