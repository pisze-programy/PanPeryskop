import Foundation
import MapKit

struct City: Identifiable, Hashable {
    let id: String
    let name: String
    let lat: Double
    let lng: Double
    let span: MKCoordinateSpan
    let isActive: Bool

    init(
        id: String,
        name: String,
        lat: Double,
        lng: Double,
        span: MKCoordinateSpan = MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05),
        isActive: Bool = false
    ) {
        self.id = id
        self.name = name
        self.lat = lat
        self.lng = lng
        self.span = span
        self.isActive = isActive
    }

    var center: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    var region: MKCoordinateRegion {
        MKCoordinateRegion(center: center, span: span)
    }

    static let all: [City] = [
        City(id: "poznan", name: "Poznań", lat: 52.4064, lng: 16.9252, isActive: true),
        City(id: "warszawa", name: "Warszawa", lat: 52.2297, lng: 21.0122, isActive: true),
        City(id: "gdansk", name: "Gdańsk", lat: 54.3520, lng: 18.6466, isActive: true),
        City(id: "krakow", name: "Kraków", lat: 50.0647, lng: 19.9450),
        City(id: "lodz", name: "Łódź", lat: 51.7592, lng: 19.4560),
        City(id: "wroclaw", name: "Wrocław", lat: 51.1079, lng: 17.0385),
        City(id: "szczecin", name: "Szczecin", lat: 53.4285, lng: 14.5528),
        City(id: "bydgoszcz", name: "Bydgoszcz", lat: 53.1235, lng: 18.0084),
        City(id: "lublin", name: "Lublin", lat: 51.2465, lng: 22.5684),
        City(id: "katowice", name: "Katowice", lat: 50.2649, lng: 19.0238),
        City(id: "bialystok", name: "Białystok", lat: 53.1325, lng: 23.1688),
    ]

    static var active: [City] { all.filter(\.isActive) }
    static var soon: [City] { all.filter { !$0.isActive } }

    static let poznan = all[0]

    static func == (lhs: City, rhs: City) -> Bool { lhs.id == rhs.id }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}
