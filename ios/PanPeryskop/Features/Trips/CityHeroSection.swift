import SwiftUI

/// The first scrollable section: the photo, the Polish name and the country.
/// The bundled thumbnail fills the frame at once, then the large photo fades in
/// on top. Both fill the same rectangle, so the sheet never jumps.
struct CityHeroSection: View {
    let city: TravelCity

    private static let height: CGFloat = 220

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            thumbnail
            RemoteImage(url: city.heroURL)
            scrim
            labels
        }
        .frame(maxWidth: .infinity)
        .frame(height: Self.height)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card))
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.s)
    }

    private var thumbnail: some View {
        Rectangle()
            .fill(CityPalette.gradient(countryCode: city.countryCode, bandRank: city.bandRank).first ?? .gray)
            .overlay {
                if let image = CityThumbStore.image(for: city.id) {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                }
            }
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
        "\(city.country) · \(city.population.formatted(.number.notation(.compactName)))"
    }
}
