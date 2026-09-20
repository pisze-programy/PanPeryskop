import SwiftUI

/// Partner banners under the attractions section. A soft revenue add-on, not a
/// core feature: full-width cards, plainly separated and clearly tappable.
struct PartnerBannerSection: View {
    let banners: [PartnerBanner]
    let onOpen: (URL) -> Void

    private static let bannerHeight: CGFloat = 168

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            TripsSectionHeader(title: "Partnerzy")
                .padding(.horizontal, Theme.Spacing.l)
            VStack(spacing: Theme.Spacing.m) {
                ForEach(banners) { banner in
                    bannerCard(banner)
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
        }
        .padding(.top, Theme.Spacing.section)
    }

    private func bannerCard(_ banner: PartnerBanner) -> some View {
        Button {
            Haptics.selection()
            onOpen(banner.url)
        } label: {
            HStack(alignment: .center, spacing: Theme.Spacing.m) {
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    Text(banner.title)
                        .font(.headline.weight(.bold))
                        .foregroundColor(banner.foreground)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(banner.subtitle)
                        .font(.subheadline)
                        .foregroundColor(banner.foreground.opacity(0.85))
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    Text(banner.cta)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(banner.buttonForeground)
                        .padding(.horizontal, Theme.Spacing.l)
                        .padding(.vertical, Theme.Spacing.s)
                        .background(banner.buttonBackground, in: Capsule())
                }
                Image(systemName: "chevron.right")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(banner.foreground.opacity(0.7))
            }
            .padding(Theme.Spacing.l)
            .frame(maxWidth: .infinity, minHeight: Self.bannerHeight, alignment: .leading)
            .background(LinearGradient(colors: banner.gradient, startPoint: .topTrailing, endPoint: .bottomLeading))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sheet, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(banner.title) \(banner.subtitle)")
    }
}
