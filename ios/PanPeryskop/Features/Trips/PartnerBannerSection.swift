import SwiftUI

/// Partner banners under the attractions section. A soft revenue add-on: compact
/// full-width cards with the copy on the left and a chevron on the right.
struct PartnerBannerSection: View {
    let banners: [PartnerBanner]
    let onOpen: (URL) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            TripsSectionHeader(title: "Partnerzy")
                .padding(.horizontal, Theme.Spacing.l)
            VStack(spacing: Theme.Spacing.s) {
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
            HStack(spacing: Theme.Spacing.m) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(banner.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(banner.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(banner.subtitle)
                        .font(.caption)
                        .foregroundColor(banner.foreground.opacity(0.8))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(banner.foreground.opacity(0.7))
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LinearGradient(colors: banner.gradient, startPoint: .topTrailing, endPoint: .bottomLeading))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(banner.title) \(banner.subtitle)")
    }
}
