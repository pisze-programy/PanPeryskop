import SwiftUI
import MapKit

/// Small, non-interactive 3D city map centred on the venue — gives the event a
/// place without opening a full map. City zoom (not street) so an imprecise
/// venue coordinate still looks right.
struct SoccerVenueMap: View {
    let coordinate: CLLocationCoordinate2D

    var body: some View {
        Map(
            initialPosition: .camera(MapCamera(centerCoordinate: coordinate, distance: 9_000, heading: 0, pitch: 50)),
            interactionModes: []
        ) {
            Marker("", systemImage: "sportscourt.fill", coordinate: coordinate)
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