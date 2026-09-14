import SwiftUI
import MapKit

/// Small, non-interactive 3D map centred on the event venue — gives the event a
/// place without opening a full map. Default is a city-ish zoom (imprecise venue
/// coordinates still look right); callers can zoom closer (e.g. a stadium).
struct VenueMap: View {
    let coordinate: CLLocationCoordinate2D
    var systemImage: String = "sportscourt.fill"
    var distance: CLLocationDistance = 9_000
    var pitch: Double = 50

    var body: some View {
        Map(
            initialPosition: .camera(MapCamera(centerCoordinate: coordinate, distance: distance, heading: 0, pitch: pitch)),
            interactionModes: []
        ) {
            Marker("", systemImage: systemImage, coordinate: coordinate)
                .tint(.red)
        }
        .frame(height: 140)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                .stroke(Theme.Palette.hairline, lineWidth: 0.5)
        )
        .allowsHitTesting(false)
    }
}