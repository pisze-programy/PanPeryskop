import SwiftUI
import MapKit

/// One renderable thing on the map. The map shell knows nothing about
/// Post / Airport / TravelEvent — it only draws these primitives.
enum MapOverlay: Identifiable {
    case pin(MapPin)
    case airport(AirportPin)
    case arc(FlightArc)
    case request(MediaRequest)

    var id: String {
        switch self {
        case .pin(let p): return "pin:\(p.post.id)"
        case .airport(let a): return "airport:\(a.iata)"
        case .arc(let a): return "arc:\(a.id)"
        case .request(let r): return "request:\(r.id)"
        }
    }
}

struct MapPin {
    let post: Post
}

struct AirportPin: Identifiable {
    let iata: String
    let coord: CLLocationCoordinate2D
    var id: String { iata }
}

struct FlightArc: Identifiable {
    let id: String
    let from: CLLocationCoordinate2D
    let to: CLLocationCoordinate2D
    let airline: Airline
}

enum Airline {
    case ryanair, wizzair
}

/// Data source for the shared map shell. One map, many providers — category
/// switching swaps the provider, never the MapKitMapView.
@MainActor
protocol MapContentProvider: ObservableObject {
    var overlays: [MapOverlay] { get }
    var initialRegion: MKCoordinateRegion { get }
    var defaultZoom: Double { get }
    /// Farthest the camera may zoom out (MapCameraBounds maximumDistance).
    var maxZoomOutDistance: CLLocationDistance { get }
    func onRegionChange(swLat: Double, swLng: Double, neLat: Double, neLng: Double)
    func onCameraSettled(_ region: MKCoordinateRegion)
}