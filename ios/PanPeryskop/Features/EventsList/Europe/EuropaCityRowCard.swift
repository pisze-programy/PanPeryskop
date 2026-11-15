import SwiftUI

struct EuropaCityRowCard: View {
    let city: TravelCity
    let originIatas: [String]
    var routeOverride: String? = nil
    let onTap: () -> Void

    @Environment(\.region) private var region

    private static let leadingInset: CGFloat = 70

    var body: some View {
        Button {
            Haptics.selection()
            onTap()
        } label: {
            cardContent
        }
        .buttonStyle(.plain)
    }

    private var cardContent: some View {
        let palette = CityPalette.gradient(countryCode: city.countryCode, bandRank: city.bandRank)
        return EuropaGamestripCard(
            leadingColor: palette.first ?? .accentColor,
            trailingColor: palette.last ?? .accentColor,
            leadingCity: city
        ) {
            rowBody
        }
    }

    private var rowBody: some View {
        HStack(spacing: Theme.Spacing.s) {
            detailsColumn
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(EdgeInsets(top: Theme.Spacing.m, leading: Self.leadingInset, bottom: Theme.Spacing.m, trailing: Theme.Spacing.m))
    }

    private var detailsColumn: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text(titleLine)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.primary)
                .lineLimit(1)
            subtitleView
        }
    }

    @ViewBuilder
    private var subtitleView: some View {
        if let secondaryLine {
            Text(secondaryLine)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    private var titleLine: String {
        let country = city.countryName(language: region.languageCode)
        guard !country.isEmpty else { return city.displayName }
        return "\(city.displayName), \(country)"
    }

    private var secondaryLine: String? {
        let parts = [populationText, route].compactMap { $0 }
        guard !parts.isEmpty else { return nil }
        return parts.joined(separator: " · ")
    }

    private var populationText: String? {
        guard city.population > 0 else { return nil }
        let formatted = city.population.formatted(.number.notation(.compactName))
        return "Populacja: \(formatted)"
    }

    private var route: String? {
        if let routeOverride, !routeOverride.isEmpty { return routeOverride }
        guard let origin = originText, let destination = destinationIata else { return nil }
        return "\(origin) → \(destination)"
    }

    private var originText: String? {
        guard !originIatas.isEmpty else { return nil }
        return originIatas.joined(separator: "/")
    }

    private var destinationIata: String? {
        if let connected = city.connections.first?.iata, !connected.isEmpty { return connected }
        return city.airports.first
    }
}
