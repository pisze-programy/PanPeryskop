import SwiftUI
import MapKit
enum MapOverlay: Identifiable {
    case pin(MapPin)
    case city(CityPin)
    case airport(AirportPin)
    case arc(FlightArc)
    case group(MapGroup)

    var id: String {
        switch self {
        case .pin(let p): return "pin:\(p.post.id)"
        case .city(let c): return "city:\(c.id)"
        case .airport(let a): return "airport:\(a.iata)"
        case .arc(let a): return "arc:\(a.id)"
        case .group(let g): return "group:\(g.id)"
        }
    }
}

struct MapPin {
    let post: Post
}

struct MapGroup: Identifiable {
    let id: String
    var posts: [Post] = []
    var cities: [TravelCity] = []
}

struct CityPin: Identifiable {
    let city: TravelCity
    var id: String { city.id }
    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: city.lat, longitude: city.lng)
    }
}

struct AirportPin: Identifiable {
    let iata: String
    let coord: CLLocationCoordinate2D
    var isOrigin: Bool = false
    var airlines: [Airline] = []
    var shimmer: Bool = false
    var id: String { iata }
}

struct FlightArc: Identifiable {
    let id: String
    let from: CLLocationCoordinate2D
    let to: CLLocationCoordinate2D
    var airlines: [Airline]
    var progress: Double = 1
    var bowOffset: Double = 0
}

enum Airline: String, Codable {
    case ryanair = "ryanair"
    case wizzair = "wizzair"

    var color: Color {
        switch self {
        case .ryanair: return Color(hex: 0x0d48bd)
        case .wizzair: return Color(hex: 0xc6007e)
        }
    }
    static func fill(_ airlines: [Airline]) -> AnyShapeStyle {
        let hasWizz = airlines.contains(.wizzair)
        let hasRyan = airlines.contains(.ryanair)
        if hasWizz && hasRyan {
            return AnyShapeStyle(LinearGradient(
                colors: [Airline.ryanair.color, Airline.wizzair.color],
                startPoint: .leading, endPoint: .trailing
            ))
        }
        if hasWizz { return AnyShapeStyle(Airline.wizzair.color) }
        if hasRyan { return AnyShapeStyle(Airline.ryanair.color) }
        return AnyShapeStyle(Color.black.opacity(0.75))
    }
}
@MainActor
protocol MapContentProvider: ObservableObject {
    var overlays: [MapOverlay] { get }
    var initialRegion: MKCoordinateRegion { get }
    var initialDistance: CLLocationDistance? { get }
    var maxZoomOutDistance: CLLocationDistance { get }
    var clusterConfig: ClusterConfig { get }
    func onRegionChange(swLat: Double, swLng: Double, neLat: Double, neLng: Double)
    func onCameraSettled(_ region: MKCoordinateRegion)
}

extension MapContentProvider {
    var initialDistance: CLLocationDistance? { nil }
    var clusterConfig: ClusterConfig { .continental }
}