import SwiftUI

/// The cities the source lists as near this one. Rows open that city's sheet.
struct CityNearbySection: View {
    let cities: [TravelCity]
    let onSelect: (TravelCity) -> Void

    var body: some View {
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
                Text(city.displayName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                Text(city.country)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
            .frame(width: 140, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
