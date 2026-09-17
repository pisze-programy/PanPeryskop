import SwiftUI

struct PlaceCard: View {
    let place: TravelPlace
    var width: CGFloat? = PlaceCard.width
    var onTap: (() -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme

    static let width: CGFloat = 200
    static let height: CGFloat = 288

    private static let imageHeight: CGFloat = 133
    private static let starSize: CGFloat = 12
    private static let featureIconSize: CGFloat = 14

    var body: some View {
        Button {
            onTap?()
        } label: {
            card
        }
        .buttonStyle(.plain)
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 0) {
            imageBlock
            details
        }
        .frame(width: width, height: Self.height, alignment: .topLeading)
        .background(place.isBestSeller ? Theme.Palette.partnerMint(colorScheme) : Theme.Palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                .stroke(Theme.Palette.hairline, lineWidth: 0.5)
        )
    }

    private var imageBlock: some View {
        ZStack(alignment: .topLeading) {
            image
                .frame(width: width, height: Self.imageHeight)
            if let badge = place.badgeLabel {
                badgePill(badge)
                    .padding(Theme.Spacing.s)
            }
        }
    }

    private var details: some View {
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

    private var image: some View {
        AsyncImage(url: URL(string: place.image)) { phase in
            switch phase {
            case .success(let img): img.resizable().scaledToFill()
            case .failure: Color(.systemGray5).overlay(Image(systemName: "photo").foregroundColor(.secondary))
            default: Color(.systemGray5)
            }
        }
        .frame(height: Self.imageHeight)
        .frame(maxWidth: .infinity)
        .clipped()
    }
}
