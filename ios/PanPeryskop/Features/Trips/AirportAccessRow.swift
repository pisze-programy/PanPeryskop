import SwiftUI
import CoreLocation
import UIKit

struct AirportAccessRow: View {
    let airportName: String
    let airport: CLLocationCoordinate2D
    let centre: CLLocationCoordinate2D

    @Environment(\.openURL) private var openURL

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            Image(systemName: "mappin.and.ellipse")
                .font(.caption)
                .foregroundColor(.secondary)
            Text("\(airportName) · \(distanceKm) km od centrum")
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(1)
            Spacer(minLength: 0)
            Button {
                Haptics.selection()
                open()
            } label: {
                Text("Jak dojechać?")
                    .font(.caption.weight(.semibold))
            }
            .buttonStyle(.plain)
            .foregroundColor(.accentColor)
        }
    }

    private var distanceKm: Int {
        AirportDirections.distanceKm(from: airport, to: centre)
    }

    private func open() {
        if let app = AirportDirections.googleMapsAppURL(from: airport, to: centre),
           UIApplication.shared.canOpenURL(app) {
            openURL(app)
            return
        }
        guard let web = URL(string: AirportDirections.webURL(from: airport, to: centre)) else { return }
        openURL(web)
    }
}
