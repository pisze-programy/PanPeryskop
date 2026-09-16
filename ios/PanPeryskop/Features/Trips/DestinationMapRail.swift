import SwiftUI
import MapKit
import CoreLocation

/// Horizontal map rail: one clean mini-map per reachable destination, an arc from
/// the origin airport to the destination, a route label and page dots. Swiping the
/// rail changes the destination.
struct DestinationMapRail: View {
    let origin: Airport
    let destinations: [Destination]
    let selected: Destination?
    let onSelect: (Destination) -> Void

    @State private var activeIata: String?

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            GeometryReader { geo in
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 0) {
                        ForEach(destinations) { dest in
                            DestinationMapPage(origin: origin, destination: dest)
                                .frame(width: geo.size.width)
                                .id(dest.iata)
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.paging)
                .scrollPosition(id: $activeIata)
            }
            .frame(height: 190)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                    .stroke(Theme.Palette.hairline, lineWidth: 0.5)
            )
            .onChange(of: activeIata) { _, newValue in
                guard let newValue, let dest = destinations.first(where: { $0.iata == newValue }) else { return }
                onSelect(dest)
            }
            .onAppear { activeIata = selected?.iata ?? destinations.first?.iata }

            if destinations.count > 1 {
                PageDots(count: destinations.count, index: currentIndex)
            }
        }
    }

    private var currentIndex: Int {
        destinations.firstIndex { $0.iata == (selected?.iata ?? activeIata) } ?? 0
    }
}

struct DestinationMapPage: View {
    let origin: Airport
    let destination: Destination

    private var originCoord: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: origin.lat, longitude: origin.lng)
    }
    private var destCoord: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: destination.lat, longitude: destination.lng)
    }

    var body: some View {
        Map(initialPosition: .region(region), interactionModes: []) {
            Marker(origin.iata, systemImage: "airplane.departure", coordinate: originCoord)
                .tint(.black)
            Marker(destination.iata, systemImage: "airplane.arrival", coordinate: destCoord)
                .tint(airlineColor)
            MapPolyline(coordinates: ArcBuilder.curve(from: originCoord, to: destCoord))
                .stroke(airlineColor, lineWidth: 3)
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
        .overlay(alignment: .bottom) { routeLabel }
        .allowsHitTesting(false)
    }

    private var routeLabel: some View {
        LinearGradient(colors: [.black.opacity(0.6), .black.opacity(0)], startPoint: .bottom, endPoint: .top)
            .frame(height: 58)
            .overlay(alignment: .bottomLeading) {
                Text("\(airlineName) • \(origin.city) (\(origin.iata)) → \(destination.city) (\(destination.iata))")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .padding(10)
            }
    }

    /// Fit the whole route (both pins and the arc) with a little padding.
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

    private var airlineName: String {
        destination.providers.contains(.wizzair) ? "Wizzair" : "Ryanair"
    }

    private var airlineColor: Color {
        destination.providers.contains(.wizzair) ? Airline.wizzair.color : Airline.ryanair.color
    }
}
