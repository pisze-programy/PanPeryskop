import SwiftUI
import MapKit

/// One renderable thing on the map. The map shell knows nothing about
/// Post / Airport / TravelEvent — it only draws these primitives.
enum MapOverlay: Identifiable {
    case pin(MapPin)
    case city(CityPin)
    case airport(AirportPin)
    case arc(FlightArc)

    var id: String {
        switch self {
        case .pin(let p): return "pin:\(p.post.id)"
        case .city(let c): return "city:\(c.id)"
        case .airport(let a): return "airport:\(a.iata)"
        case .arc(let a): return "arc:\(a.id)"
        }
    }
}

struct MapPin {
    let post: Post
    /// Non-empty when tapped via a cluster — the group the card shows.
    var group: [Post] = []
}

/// A city-break destination. Its own layer: it never joins the event cluster.
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
    /// True for the selected origin airport — renders OriginAirportPin.
    var isOrigin: Bool = false
    /// Airlines serving the origin (border colors). Empty for destinations.
    var airlines: [Airline] = []
    /// Animates a light sweep across the badge while the map is still loading.
    var shimmer: Bool = false
    var id: String { iata }
}

struct FlightArc: Identifiable {
    let id: String
    let from: CLLocationCoordinate2D
    let to: CLLocationCoordinate2D
    var airlines: [Airline]
    /// Draw progress 0…1. 1 for a finished route.
    var progress: Double = 1
    /// Sideways bow shift. Dual-carrier routes draw two arcs, one per side.
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

    /// Both carriers draw a split gradient.
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

/// Data source for the shared map shell. One map, many providers — category
/// switching swaps the provider, never the MapKitMapView.
@MainActor
protocol MapContentProvider: ObservableObject {
    var overlays: [MapOverlay] { get }
    var initialRegion: MKCoordinateRegion { get }
    /// Camera height for `initialRegion`. Nil derives it from the region span.
    var initialDistance: CLLocationDistance? { get }
    /// Farthest the camera may zoom out (MapCameraBounds maximumDistance).
    var maxZoomOutDistance: CLLocationDistance { get }
    func onRegionChange(swLat: Double, swLng: Double, neLat: Double, neLng: Double)
    func onCameraSettled(_ region: MKCoordinateRegion)
}

extension MapContentProvider {
    var initialDistance: CLLocationDistance? { nil }
}