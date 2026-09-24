import SwiftUI
import CoreLocation

struct CityNearbySection: View {
    let cities: [TravelCity]
    let from: CLLocationCoordinate2D
    let onSelect: (TravelCity) -> Void

    @Environment(\.region) private var region

    private static let cardWidth: CGFloat = 180
    private static let photoHeight: CGFloat = 120

    var body: some View {
        Group {
            if !cities.isEmpty { section }
        }
    }

    private var section: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TripsSectionHeader(title: "W okolicy")
                .padding(.horizontal, Theme.Spacing.l)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: Theme.Spacing.s) {
                    ForEach(cities) { city in
                        card(city)
                    }
                }
                .padding(.horizontal, Theme.Spacing.l)
            }
        }
    }

    private func card(_ city: TravelCity) -> some View {
        Button {
            Haptics.selection()
            onSelect(city)
        } label: {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                photo(city)
                nameLine(city)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Text(city.countryName(language: region.languageCode))
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
            .frame(width: Self.cardWidth, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func nameLine(_ city: TravelCity) -> Text {
        Text(city.displayName)
            .font(.subheadline.weight(.semibold))
            .foregroundColor(.primary)
            + Text(" · \(AirportDirections.distanceKm(from: from, to: coordinate(city))) km")
            .font(.caption2)
            .foregroundColor(.secondary)
    }

    private func coordinate(_ city: TravelCity) -> CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: city.lat, longitude: city.lng)
    }

    private func photo(_ city: TravelCity) -> some View {
        CityPhoto(city: city)
            .frame(width: Self.cardWidth, height: Self.photoHeight)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card))
    }
}
