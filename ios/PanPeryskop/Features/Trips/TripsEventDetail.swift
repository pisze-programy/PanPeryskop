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
    private static let separator = ", "
    private static let distanceTitle = "Dystans:"

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
            if !distanceTags.isEmpty {
                distanceRow
            }
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
                    .lineLimit(2)
            }
            if !tags.isEmpty {
                chipRow(tags)
            }
        }
    }

    private var distanceRow: some View {
        VStack(alignment: .leading, spacing: Self.tagSpacing) {
            Text(Self.distanceTitle)
                .font(.caption.weight(.semibold))
                .foregroundColor(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                chipRow(distanceTags)
            }
        }
    }

    private func chipRow(_ values: [String]) -> some View {
        HStack(spacing: Self.tagSpacing) {
            ForEach(Array(values.enumerated()), id: \.offset) { _, value in
                chip(value)
            }
        }
    }

    private func chip(_ value: String) -> some View {
        Text(value)
            .font(.caption.weight(.semibold))
            .foregroundColor(.secondary)
            .padding(.horizontal, Self.tagHorizontalPadding)
            .padding(.vertical, Self.tagVerticalPadding)
            .background(Theme.Palette.surface, in: Capsule())
    }

    private var headlineText: String? {
        event.isRun ? nil : venueLabel
    }

    private var venueLabel: String {
        if let venue = meta?.venue, !venue.isEmpty { return venue }
        return placeLabel
    }

    private var tags: [String] {
        guard event.isRun else { return [] }
        return [RunLabels.text(meta?.surface), RunLabels.text(meta?.difficulty)].compactMap { $0 }
    }

    private var distanceTags: [String] {
        guard event.isRun else { return [] }
        return RunDistances.tags(meta)
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
