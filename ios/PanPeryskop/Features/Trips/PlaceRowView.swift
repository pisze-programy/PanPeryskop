import SwiftUI
import CoreLocation

struct PlaceRowView: View {
    let place: TravelPlace
    let kind: PlaceKind
    let eventCoordinate: CLLocationCoordinate2D
    let airportCoordinate: CLLocationCoordinate2D?
    let nights: Int
    let onOpen: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    private static let partnerHeight: CGFloat = 252
    private static let partnerImageWidth: CGFloat = 140
    private static let starSize: CGFloat = 13
    private static let featureIconSize: CGFloat = 15
    private static let ctaHeight: CGFloat = 44
    private static let ctaBorderWidth: CGFloat = 1.5

    var body: some View {
        Button(action: onOpen) {
            if place.isPartner {
                partnerRow
            } else {
                legacyRow
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Partner row

    private var partnerRow: some View {
        HStack(alignment: .top, spacing: 0) {
            AsyncImage(url: URL(string: place.image)) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                case .failure: Color(.systemGray5).overlay(Image(systemName: "photo").foregroundColor(.secondary))
                default: Color(.systemGray5)
                }
            }
            .frame(width: Self.partnerImageWidth, height: Self.partnerHeight)
            .clipped()

            VStack(alignment: .leading, spacing: 6) {
                if let badge = place.badgeLabel {
                    Text(badge)
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(Theme.Palette.partnerMintText)
                        .padding(.horizontal, Theme.Spacing.s)
                        .padding(.vertical, Theme.Spacing.xs)
                        .background(Theme.Palette.partnerMint(colorScheme), in: Capsule())
                }
                if let label = place.ratingLabel {
                    HStack(spacing: 3) {
                        Image(systemName: "star.fill")
                            .font(.system(size: Self.starSize))
                            .foregroundColor(Theme.Palette.partnerGreen)
                        Text(label)
                            .font(.caption.weight(.semibold))
                    }
                }
                Text(place.name)
                    .font(.subheadline.weight(.bold))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                partnerFeatures
                Spacer(minLength: 0)
                partnerPrice
                partnerCTA
            }
            .padding(Theme.Spacing.m)
        }
        .frame(height: Self.partnerHeight)
        .background(place.isBestSeller ? Theme.Palette.partnerMint(colorScheme) : Theme.Palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                .stroke(Theme.Palette.hairline, lineWidth: 0.5)
        )
        .contentShape(Rectangle())
    }

    private var partnerFeatures: some View {
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

    private var partnerPrice: some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text("od")
                .font(.caption2)
                .foregroundColor(.secondary)
            Text(place.priceAmountLabel)
                .font(.title3.weight(.bold))
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
    }

    private var partnerCTA: some View {
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

    // MARK: - Local catalogue row

    private var legacyRow: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .center, spacing: Theme.Spacing.m) {
                legacyDetails
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.secondary)
            }
            gallery
        }
        .padding(Theme.Spacing.m)
        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
        .contentShape(Rectangle())
    }

    private var legacyDetails: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(place.name)
                .font(.headline.weight(.bold))
                .lineLimit(2)
            if let rating = place.rating {
                Text("★ \(String(format: "%.1f", rating)) · \(place.reviews ?? 0) opinii")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            if kind == .hotel {
                Text(place.nightlyPriceLabel)
                    .font(.subheadline.weight(.bold))
                Text(place.totalPriceLabel(nights: nights))
                    .font(.caption)
                    .foregroundColor(.secondary)
            } else {
                Text(place.priceLabel)
                    .font(.subheadline.weight(.bold))
            }
            Text(place.address)
                .font(.caption)
                .foregroundColor(.secondary)
            Text(place.distancesLabel(event: eventCoordinate, airport: airportCoordinate))
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    private var gallery: some View {
        GeometryReader { geo in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    AsyncImage(url: URL(string: place.image)) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFill()
                        case .failure: Color(.systemGray5).overlay(Image(systemName: "photo").foregroundColor(.secondary))
                        default: Color(.systemGray5)
                        }
                    }
                    .frame(width: geo.size.width, height: 180)
                }
            }
        }
        .frame(height: 180)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous))
    }
}
