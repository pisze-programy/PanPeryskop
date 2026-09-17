import SwiftUI

struct PlaceRowView: View {
    let place: TravelPlace
    let onOpen: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    private static let height: CGFloat = 252
    private static let imageWidth: CGFloat = 140
    private static let starSize: CGFloat = 13
    private static let featureIconSize: CGFloat = 15
    private static let ctaHeight: CGFloat = 44
    private static let ctaBorderWidth: CGFloat = 1.5

    var body: some View {
        Button(action: onOpen) {
            row
        }
        .buttonStyle(.plain)
    }

    private var row: some View {
        HStack(alignment: .top, spacing: 0) {
            image
            details
        }
        .frame(height: Self.height)
        .background(place.isBestSeller ? Theme.Palette.partnerMint(colorScheme) : Theme.Palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                .stroke(Theme.Palette.hairline, lineWidth: 0.5)
        )
        .contentShape(Rectangle())
    }

    private var image: some View {
        AsyncImage(url: URL(string: place.image)) { phase in
            switch phase {
            case .success(let img): img.resizable().scaledToFill()
            case .failure: Color(.systemGray5).overlay(Image(systemName: "photo").foregroundColor(.secondary))
            default: Color(.systemGray5)
            }
        }
        .frame(width: Self.imageWidth, height: Self.height)
        .clipped()
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let badge = place.badgeLabel {
                badgePill(badge)
            }
            rating
            Text(place.name)
                .font(.subheadline.weight(.bold))
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            features
            Spacer(minLength: 0)
            price
            cta
        }
        .padding(Theme.Spacing.m)
    }

    private var features: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            if let duration = place.durationLabel {
                feature(icon: "clock", text: duration)
            }
            if place.hasFreeCancellation {
                feature(icon: "checkmark.circle", text: "Bezpłatne odwołanie")
            }
        }
    }

    private func feature(icon: String, text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: Self.featureIconSize))
            Text(text)
                .font(.caption)
        }
    }

    @ViewBuilder
    private var rating: some View {
        if let label = place.ratingLabel {
            HStack(spacing: 3) {
                Image(systemName: "star.fill")
                    .font(.system(size: Self.starSize))
                    .foregroundColor(Theme.Palette.partnerGreen)
                Text(label)
                    .font(.caption.weight(.semibold))
            }
        }
    }

    private var price: some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text("od")
                .font(.caption2)
                .foregroundColor(.secondary)
            Text(place.priceAmountLabel)
                .font(.title3.weight(.bold))
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
    }

    private var cta: some View {
        Text("Sprawdź dostępność")
            .font(.subheadline.weight(.semibold))
            .foregroundColor(.primary)
            .frame(maxWidth: .infinity)
            .frame(height: Self.ctaHeight)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.chip)
                    .stroke(Color.primary, lineWidth: Self.ctaBorderWidth)
            )
    }

    private func badgePill(_ text: String) -> some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .foregroundColor(Theme.Palette.partnerMintText)
            .padding(.horizontal, Theme.Spacing.s)
            .padding(.vertical, Theme.Spacing.xs)
            .background(Theme.Palette.partnerMint(colorScheme), in: Capsule())
    }
}
