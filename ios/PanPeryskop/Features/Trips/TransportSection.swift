import SwiftUI
import MapKit
import CoreLocation

/// Transport section: how to get from the arrival airport to the chosen hotel.
/// It listens to the planner — with no flight/hotel picked it shows a grey hint;
/// otherwise a mini-map plus Google Maps route buttons (transit / driving).
struct TransportSection: View {
    @ObservedObject var planner: TripsEventPlanner

    private var airport: Destination? { planner.destination }
    private var hotel: TravelPlace? { planner.hotel }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            TripsSectionHeader(
                title: "Transport",
                info: "Trasa z lotniska do wybranego hotelu. Otwórz nawigację w Google Maps."
            )
            .padding(.horizontal, Theme.Spacing.l)

            if let airport, let hotel {
                route(from: Self.coord(airport.lat, airport.lng), to: Self.coord(hotel.lat, hotel.lng))
            } else {
                placeholder
            }
        }
        .padding(.top, Theme.Spacing.l)
    }

    private func route(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> some View {
        VStack(spacing: Theme.Spacing.s) {
            TransportMiniMap(from: from, to: to)
            HStack(spacing: Theme.Spacing.s) {
                CapsuleButton(title: "Komunikacja", fullWidth: true) {
                    open(mapsURL(from: from, to: to, mode: "transit"))
                }
                CapsuleButton(title: "Samochód", tint: .gray, fullWidth: true) {
                    open(mapsURL(from: from, to: to, mode: "driving"))
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
    }

    private var placeholder: some View {
        HStack(spacing: Theme.Spacing.s) {
            Image(systemName: "arrow.triangle.swap")
            Text("Zaznacz loty i hotel aby zobaczyć wskazówki transportu")
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundColor(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.l)
        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
        .padding(.horizontal, Theme.Spacing.l)
    }

    private func mapsURL(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D, mode: String) -> URL? {
        var components = URLComponents(string: "https://www.google.com/maps/dir/")
        components?.queryItems = [
            URLQueryItem(name: "api", value: "1"),
            URLQueryItem(name: "origin", value: "\(from.latitude),\(from.longitude)"),
            URLQueryItem(name: "destination", value: "\(to.latitude),\(to.longitude)"),
            URLQueryItem(name: "travelmode", value: mode),
        ]
        return components?.url
    }

    private func open(_ url: URL?) {
        guard let url else { return }
        UIApplication.shared.open(url)
    }

    private static func coord(_ lat: Double, _ lng: Double) -> CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }
}

/// Small non-interactive map: arrival airport → hotel with a connecting line.
struct TransportMiniMap: View {
    let from: CLLocationCoordinate2D
    let to: CLLocationCoordinate2D

    var body: some View {
        Map(initialPosition: .region(region), interactionModes: []) {
            Marker("Lotnisko", systemImage: "airplane", coordinate: from).tint(.blue)
            Marker("Hotel", systemImage: "bed.double.fill", coordinate: to).tint(.orange)
            MapPolyline(coordinates: [from, to]).stroke(.purple, lineWidth: 3)
        }
        .frame(height: 160)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                .stroke(Theme.Palette.hairline, lineWidth: 0.5)
        )
    }

    private var region: MKCoordinateRegion {
        let center = CLLocationCoordinate2D(
            latitude: (from.latitude + to.latitude) / 2,
            longitude: (from.longitude + to.longitude) / 2
        )
        let span = MKCoordinateSpan(
            latitudeDelta: max(abs(from.latitude - to.latitude) * 1.8, 0.05),
            longitudeDelta: max(abs(from.longitude - to.longitude) * 1.8, 0.05)
        )
        return MKCoordinateRegion(center: center, span: span)
    }
}
