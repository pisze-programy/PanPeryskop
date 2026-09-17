import SwiftUI
import MapKit
import CoreLocation

struct DestinationMapPage: View {
    let origin: Airport
    let option: FlightOption

    private var originCoord: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: origin.lat, longitude: origin.lng)
    }
    private var destCoord: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: option.destination.lat, longitude: option.destination.lng)
    }

    var body: some View {
        Map(initialPosition: .region(region), interactionModes: []) {
            Marker(origin.iata, systemImage: "airplane.departure", coordinate: originCoord)
                .tint(.black)
            Marker(option.destination.iata, systemImage: "airplane.arrival", coordinate: destCoord)
                .tint(option.carrier.color)
            MapPolyline(coordinates: ArcBuilder.curve(from: originCoord, to: destCoord))
                .stroke(option.carrier.color, lineWidth: 3)
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
        .overlay(alignment: .bottom) { routeLabel }
        .allowsHitTesting(false)
    }

    private var routeLabel: some View {
        LinearGradient(colors: [.black.opacity(0.6), .black.opacity(0)], startPoint: .bottom, endPoint: .top)
            .frame(height: 58)
            .overlay(alignment: .bottomLeading) {
                Text(routeText)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .padding(10)
            }
    }

    private var routeText: String {
        let destination = option.destination
        return "\(option.carrier.displayName) • \(origin.city) (\(origin.iata)) → \(destination.city) (\(destination.iata))"
    }

    private var region: MKCoordinateRegion {
        let points = ArcBuilder.curve(from: originCoord, to: destCoord)
        let lats = points.map(\.latitude)
        let lngs = points.map(\.longitude)
        let minLat = lats.min() ?? 0, maxLat = lats.max() ?? 0
        let minLng = lngs.min() ?? 0, maxLng = lngs.max() ?? 0
        let span = max(maxLat - minLat, maxLng - minLng) * 1.4
        return MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2),
            span: MKCoordinateSpan(latitudeDelta: max(span, 0.4), longitudeDelta: max(span, 0.4))
        )
    }
}
