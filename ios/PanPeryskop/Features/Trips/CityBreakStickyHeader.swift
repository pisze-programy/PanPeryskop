import SwiftUI

/// Sticky bar at the top of the city-break sheet. The background runs the country
/// colour into its lighter tier shade, so every city reads as "country → city".
struct CityBreakStickyHeader: View {
    let city: TravelCity
    let onClose: () -> Void

    private static let iconSize: CGFloat = 20
    private static let closeSize: CGFloat = 30

    private var tierLabel: String {
        switch city.tier {
        case "metropolis": return "Metropolia"
        case "large": return "Duże miasto"
        default: return "Średnie miasto"
        }
    }

    private var gradient: [Color] {
        CityPalette.gradient(countryCode: city.countryCode, tier: city.tier)
    }

    var body: some View {
        StickyBar(
            leadingColor: gradient.first ?? .accentColor,
            trailingColor: gradient.last ?? .accentColor,
            bottomPadding: Theme.Spacing.s
        ) {
            HStack(spacing: Theme.Spacing.s) {
                Image(systemName: "building.2.fill")
                    .font(.system(size: Self.iconSize, weight: .semibold))
                    .foregroundColor(gradient.first ?? .accentColor)
                VStack(alignment: .leading, spacing: 0) {
                    Text(city.name)
                        .font(.headline)
                        .lineLimit(1)
                    Text("\(city.country) · \(tierLabel)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: Theme.Spacing.s)
                closeButton
            }
            .padding(.horizontal, Theme.Spacing.l)
        }
    }

    private var closeButton: some View {
        Button {
            Haptics.selection()
            onClose()
        } label: {
            Image(systemName: "xmark")
                .font(.footnote.weight(.bold))
                .foregroundColor(.secondary)
                .frame(width: Self.closeSize, height: Self.closeSize)
                .background(Theme.Palette.surface, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Zamknij")
    }
}
