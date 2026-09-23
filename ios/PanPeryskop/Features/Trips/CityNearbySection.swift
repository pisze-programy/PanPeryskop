import SwiftUI
import CoreLocation

struct CityNearbySection: View {
    let cities: [TravelCity]
    let from: CLLocationCoordinate2D
    let onSelect: (TravelCity) -> Void

    @Environment(\.region) private var region

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
                LazyHStack(spacing: Theme.Spacing.s) {
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
                Text(cityLine(city))
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                Text(city.countryName(language: region.languageCode))
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
            .frame(width: 140, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func cityLine(_ city: TravelCity) -> String {
        "\(city.displayName), \(AirportDirections.distanceKm(from: from, to: coordinate(city))) km"
    }

    private func coordinate(_ city: TravelCity) -> CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: city.lat, longitude: city.lng)
    }

    private func photo(_ city: TravelCity) -> some View {
        AsyncImage(url: city.pinURL) { image in
            image.resizable().aspectRatio(contentMode: .fill)
        } placeholder: {
            CityPalette.gradient(countryCode: city.countryCode, bandRank: city.bandRank).first
        }
        .frame(width: 140, height: 92)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card))
    }
}
