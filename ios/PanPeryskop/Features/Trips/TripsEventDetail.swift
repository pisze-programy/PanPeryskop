import SwiftUI
import CoreLocation

/// Everything under the gamestrip on a trips page. Both event kinds use this one
/// layout; only the texts, the tags and the button differ.
struct TripsEventDetail: View {
    let event: TravelEvent
    let onOpenURL: (URL, BrowserAccess) -> Void
    let onOpenMap: (CLLocationCoordinate2D, String) -> Void

    private static let headlineSpacing: CGFloat = 4
    private static let tagSpacing = Theme.Spacing.xs
    private static let tagHorizontalPadding = Theme.Spacing.s
    private static let tagVerticalPadding = Theme.Spacing.xs
    private static let distancePreviewCount = 3
    private static let separator = ", "

    private var meta: TravelEventMeta? { event.metaData }

    private var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: event.lat, longitude: event.lng)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            headline
            Text(placeLabel)
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(1)
            VenueMap(
                coordinate: coordinate,
                systemImage: mapIcon,
                onTap: { onOpenMap(coordinate, event.title) }
            )
            if let url = linkURL {
                CapsuleButton(title: buttonTitle, trailingText: buttonTrailing, fullWidth: true) {
                    onOpenURL(url, linkAccess)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.m)
        .padding(.bottom, Theme.Spacing.m)
    }

    private var headline: some View {
        VStack(alignment: .leading, spacing: Self.headlineSpacing) {
            if let headlineText {
                Text(headlineText)
                    .font(.title3.weight(.bold))
                    .foregroundColor(headlineColor)
                    .lineLimit(2)
            }
            if !tags.isEmpty {
                tagRow
            }
        }
    }

    private var tagRow: some View {
        HStack(spacing: Self.tagSpacing) {
            ForEach(Array(tags.enumerated()), id: \.offset) { _, tag in
                Text(tag)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, Self.tagHorizontalPadding)
                    .padding(.vertical, Self.tagVerticalPadding)
                    .background(Theme.Palette.surface, in: Capsule())
            }
        }
    }

    private var headlineText: String? {
        event.isRun ? distanceLabel : venueLabel
    }

    private var headlineColor: Color {
        event.isRun ? RunPalette.color(for: event) : .primary
    }

    private var distanceLabel: String? {
        if let distance = meta?.distance, !distance.isEmpty { return distance }
        if let distances = meta?.distances, !distances.isEmpty {
            return distances.prefix(Self.distancePreviewCount).joined(separator: Self.separator)
        }
        return nil
    }

    private var venueLabel: String {
        if let venue = meta?.venue, !venue.isEmpty { return venue }
        return placeLabel
    }

    private var tags: [String] {
        guard event.isRun else { return [] }
        return [RunLabels.text(meta?.surface), RunLabels.text(meta?.difficulty)].compactMap { $0 }
    }

    private var placeLabel: String {
        "\(event.city)\(Self.separator)\(event.country)"
    }

    private var mapIcon: String {
        event.isRun ? "figure.run" : "sportscourt.fill"
    }

    private var linkURL: URL? {
        let raw = event.isRun ? (event.link ?? meta?.website) : event.link
        guard let raw, let url = URL(string: raw) else { return nil }
        return url
    }

    private var linkAccess: BrowserAccess {
        event.isRun ? .open : .restricted
    }

    private var priceLabel: String? {
        guard event.isRun, let price = meta?.price, !price.isEmpty else { return nil }
        return price
    }

    private var buttonTitle: String {
        priceLabel == nil ? "Zobacz więcej" : "Zapisz się"
    }

    private var buttonTrailing: String? {
        priceLabel
    }
}
