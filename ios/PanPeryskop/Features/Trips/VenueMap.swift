import SwiftUI
import MapKit

struct VenueMap: View {
    let coordinate: CLLocationCoordinate2D
    var systemImage: String = "sportscourt.fill"
    var distance: CLLocationDistance = 9_000
    var pitch: Double = 50
    var onTap: (() -> Void)? = nil

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
        .overlay {
            if let onTap {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { onTap() }
            }
        }
    }
}
