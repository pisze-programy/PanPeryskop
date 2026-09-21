import SwiftUI

/// The first scrollable section: the photo, the Polish name and the country.
struct CityHeroSection: View {
    let city: TravelCity

    @State private var loaded = false

    private static let height: CGFloat = 220

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            placeholder
            hero
            scrim
            labels
        }
        .frame(maxWidth: .infinity)
        .frame(height: Self.height)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card))
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.s)
    }

    /// The bundled thumbnail fills the frame from the first moment, so the sheet
    /// never jumps when the large photo arrives. It is the same picture, only
    /// soft, and it is free.
    private var placeholder: some View {
        Group {
            if let image = CityThumbStore.image(for: city.id) {
                Image(uiImage: image).resizable().aspectRatio(contentMode: .fill)
            } else {
                CityPalette.gradient(countryCode: city.countryCode, bandRank: city.bandRank).first
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }

    private var hero: some View {
        AsyncImage(url: city.heroURL) { phase in
            if case .success(let image) = phase {
                image.resizable().aspectRatio(contentMode: .fill)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipped()
                    .opacity(loaded ? 1 : 0)
                    .onAppear { withAnimation(.easeInOut(duration: 0.3)) { loaded = true } }
            } else {
                Color.clear
            }
        }
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
