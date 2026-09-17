import SwiftUI
import CoreLocation

struct PlaceCard: View {
    let place: TravelPlace
    let eventCoordinate: CLLocationCoordinate2D
    let airportCoordinate: CLLocationCoordinate2D?
    var nights: Int = 1
    var width: CGFloat? = PlaceCard.width
    var onTap: (() -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme

    static let width: CGFloat = 200
    static let partnerHeight: CGFloat = 288
    static let legacyHeight: CGFloat = 230

    private static let partnerImageHeight: CGFloat = 133
    private static let legacyImageHeight: CGFloat = 92
    private static let starSize: CGFloat = 12
    private static let featureIconSize: CGFloat = 14

    static func height(for place: TravelPlace) -> CGFloat {
        place.isPartner ? partnerHeight : legacyHeight
    }

    static func skeletonHeight(for kind: PlaceKind) -> CGFloat {
        kind == .attraction ? partnerHeight : legacyHeight
    }

    var body: some View {
        Button {
            onTap?()
        } label: {
            card
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var card: some View {
        if place.isPartner {
            partnerTile
        } else {
            legacyTile
        }
    }

    // MARK: - Partner tile

    private var partnerTile: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topLeading) {
                image
                    .frame(width: width, height: Self.partnerImageHeight)
                if let badge = place.badgeLabel {
                    badgePill(badge)
                        .padding(Theme.Spacing.s)
                }
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text(place.name)
                    .font(.subheadline.weight(.bold))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                features
                Spacer(minLength: 0)
                HStack(alignment: .bottom, spacing: Theme.Spacing.s) {
                    rating
                    Spacer(minLength: 0)
                    partnerPrice
                }
            }
            .padding(Theme.Spacing.m)
        }
        .frame(width: width, height: Self.partnerHeight, alignment: .topLeading)
        .background(place.isBestSeller ? Theme.Palette.partnerMint(colorScheme) : Theme.Palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                .stroke(Theme.Palette.hairline, lineWidth: 0.5)
        )
    }

    private var features: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            if place.hasFreeCancellation {
                feature(icon: "checkmark.circle", text: "Bezpłatne odwołanie")
            }
            if let duration = place.durationLabel {
                feature(icon: "clock", text: duration)
            }
        }
    }

    private func feature(icon: String, text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: Self.featureIconSize))
            Text(text)
                .font(.caption)
                .lineLimit(1)
        }
        .foregroundColor(.primary)
    }

    private var rating: some View {
        HStack(spacing: 3) {
            Image(systemName: "star.fill")
                .font(.system(size: Self.starSize))
                .foregroundColor(Theme.Palette.partnerGreen)
            if let label = place.ratingLabel {
                Text(label)
                    .font(.caption.weight(.semibold))
            }
        }
    }

    private var partnerPrice: some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text("od")
                .font(.caption2)
                .foregroundColor(.secondary)
            Text(place.priceAmountLabel)
                .font(.subheadline.weight(.bold))
        }
    }

    private func badgePill(_ text: String) -> some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .foregroundColor(Theme.Palette.partnerMintText)
            .padding(.horizontal, Theme.Spacing.s)
            .padding(.vertical, Theme.Spacing.xs)
            .background(Theme.Palette.partnerMint(colorScheme), in: Capsule())
    }

    // MARK: - Local catalogue tile

    private var legacyTile: some View {
        VStack(alignment: .leading, spacing: 6) {
            image
            Text(place.name)
                .font(.subheadline.weight(.bold))
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            if let rating = place.rating {
                Text("★ \(String(format: "%.1f", rating)) · \(place.reviews ?? 0) opinii")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            if place.kind == .hotel {
                Text(place.nightlyPriceLabel)
                    .font(.subheadline.weight(.bold))
                Text(place.totalPriceLabel(nights: nights))
                    .font(.caption2)
                    .foregroundColor(.secondary)
            } else {
                Text(place.priceLabel)
                    .font(.subheadline.weight(.bold))
            }
            Text(place.address)
                .font(.caption2)
                .foregroundColor(.secondary)
                .lineLimit(1)
            Text(place.distancesLabel(event: eventCoordinate, airport: airportCoordinate))
                .font(.caption2)
                .foregroundColor(.secondary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(width: width, height: Self.legacyHeight, alignment: .topLeading)
    }

    private var image: some View {
        AsyncImage(url: URL(string: place.image)) { phase in
            switch phase {
            case .success(let img): img.resizable().scaledToFill()
            case .failure: Color(.systemGray5).overlay(Image(systemName: "photo").foregroundColor(.secondary))
            default: Color(.systemGray5)
            }
        }
        .frame(height: place.isPartner ? Self.partnerImageHeight : Self.legacyImageHeight)
        .frame(maxWidth: .infinity)
        .clipped()
    }
}
