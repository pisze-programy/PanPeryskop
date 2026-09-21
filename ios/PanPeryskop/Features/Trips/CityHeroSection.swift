import SwiftUI

/// The first scrollable section: the photo, the Polish name and the country.
struct CityHeroSection: View {
    let city: TravelCity

    private static let height: CGFloat = 220

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            photo
            scrim
            labels
        }
        .frame(height: Self.height)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card))
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.s)
    }

    private var photo: some View {
        AsyncImage(url: city.heroURL) { image in
            image.resizable().aspectRatio(contentMode: .fill)
        } placeholder: {
            CityPalette.gradient(countryCode: city.countryCode, bandRank: city.bandRank).first
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }

    private var scrim: some View {
        LinearGradient(
            colors: [.clear, .black.opacity(0.65)],
            startPoint: .center,
            endPoint: .bottom
        )
    }

    private var labels: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text(city.displayName)
                .font(.title2.weight(.bold))
                .foregroundColor(.white)
                .lineLimit(2)
            Text(subtitle)
                .font(.footnote.weight(.medium))
                .foregroundColor(.white.opacity(0.85))
                .lineLimit(1)
        }
        .padding(Theme.Spacing.l)
    }

    private var subtitle: String {
        let people = city.population.formatted(.number.notation(.compactName))
        return "\(city.country) · \(people)"
    }
}
