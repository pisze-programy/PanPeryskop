import SwiftUI

/// Partner banners under the attractions section. A soft revenue add-on: compact
/// full-width cards with the copy on the left and a chevron on the right.
struct PartnerBannerSection: View {
    let banners: [PartnerBanner]
    var carRental: CarRentalContext? = nil
    let onOpen: (URL) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            TripsSectionHeader(title: "Partnerzy")
                .padding(.horizontal, Theme.Spacing.l)
            VStack(spacing: Theme.Spacing.s) {
                ForEach(Array(banners.enumerated()), id: \.element.id) { index, banner in
                    bannerCard(banner)
                    if index == 0, let carRental, !carRental.iata.isEmpty {
                        CarRentalBanner(context: carRental)
                    }
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
                if let icon = banner.icon {
                    PartnerLogo(name: icon)
                }
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
                    .foregroundColor(banner.chevron.opacity(0.9))
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .partnerCardBackground(stops: banner.stops)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(banner.title) \(banner.subtitle)")
    }
}
