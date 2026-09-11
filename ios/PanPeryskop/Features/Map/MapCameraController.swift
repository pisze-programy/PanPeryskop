import SwiftUI
import MapKit

/// Direct camera control for the map shell — replaces the flyToCity NotificationCenter
/// channel. The shell binds its flyTo handler here; MapScreen calls it on city/airport select.
@MainActor
final class MapCameraController: ObservableObject {
    private var flyTo: ((MKCoordinateRegion) -> Void)?
    private var flyToAvoidingSheet: ((CLLocationCoordinate2D) -> Void)?

    func bind(_ handler: @escaping (MKCoordinateRegion) -> Void) {
        flyTo = handler
    }

    /// Deliberate camera shift so a tapped point lands in the upper half of the
    /// screen instead of the center — keeps it visible above a medium detail
    /// sheet (which covers the lower ~50%). General: fits any sheet-based layout.
    func bindAvoidingSheet(_ handler: @escaping (CLLocationCoordinate2D) -> Void) {
        flyToAvoidingSheet = handler
    }

    func fly(to region: MKCoordinateRegion) {
        flyTo?(region)
    }

    /// Centers on a coordinate, shifted to stay visible above the medium sheet
    /// (no zoom change — the current camera distance is kept).
    func flyToAboveSheet(_ coordinate: CLLocationCoordinate2D) {
        flyToAvoidingSheet?(coordinate)
    }
}
