import SwiftUI
struct CityHeroSection: View {
    let city: TravelCity
    let onOpenURL: (URL) -> Void

    @Environment(\.region) private var region

    private static let height: CGFloat = 220

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            CityPhoto(city: city, wantsLarge: true)
            scrim
            labels
        }
        .overlay(alignment: .bottomTrailing) { creditBadge }
        .frame(maxWidth: .infinity)
        .frame(height: Self.height)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card))
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.s)
    }

    @ViewBuilder
    private var creditBadge: some View {
        if let credit = city.imageCredit,
           let url = URL(string: credit.photoUrl),
           !credit.author.isEmpty {
            Button {
                onOpenURL(url)
            } label: {
                Text("Photo by \(credit.author) via Unsplash")
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.75))
                    .padding(.horizontal, Theme.Spacing.s)
                    .padding(.bottom, Theme.Spacing.s)
            }
            .buttonStyle(.plain)
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
        "\(city.countryName(language: region.languageCode)) · \(city.population.formatted(.number.notation(.compactName)))"
    }
}
