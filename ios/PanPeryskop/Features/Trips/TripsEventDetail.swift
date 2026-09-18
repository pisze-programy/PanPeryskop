import SwiftUI
import CoreLocation

/// Everything under the gamestrip on a trips page. Both event kinds use this one
/// layout; only the texts, the distance chips and the button differ.
struct TripsEventDetail: View {
    let event: TravelEvent
    let onOpenURL: (URL, BrowserAccess) -> Void
    let onOpenMap: (CLLocationCoordinate2D, String) -> Void

    private static let tagSpacing = Theme.Spacing.xs
    private static let tagHorizontalPadding = Theme.Spacing.s
    private static let tagVerticalPadding = Theme.Spacing.xs
    private static let separator = ", "
    private static let distanceTitle = "Dystans:"

    @State private var distancesWidth: CGFloat = 0
    @State private var distancesContainer: CGFloat = 0

    private var meta: TravelEventMeta? { event.metaData }

    private var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: event.lat, longitude: event.lng)
    }

    private var guessesVenue: Bool { event.venueIsAirport == true }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            if !distanceTags.isEmpty {
                distanceRow
            }
            venueCaption
            if !guessesVenue {
                VenueMap(
                    coordinate: coordinate,
                    systemImage: mapIcon,
                    distance: mapDistance,
                    pitch: mapPitch,
                    onTap: { onOpenMap(coordinate, event.title) }
                )
            }
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

    private var distanceRow: some View {
        HStack(spacing: Self.tagSpacing) {
            Text(Self.distanceTitle)
                .font(.caption.weight(.semibold))
                .foregroundColor(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Self.tagSpacing) {
                    ForEach(Array(distanceTags.enumerated()), id: \.offset) { _, value in
                        chip(value)
                    }
                }
                .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { _, width in
                    distancesWidth = width
                }
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { _, width in
                distancesContainer = width
            }
            .scrollDisabled(distancesWidth <= distancesContainer)
            .scrollBounceBehavior(.basedOnSize)
        }
    }

    private var venueCaption: some View {
        Group {
            if let venue = venueName {
                Text(venue).font(.subheadline.weight(.semibold))
                    + Text(Self.separator).foregroundColor(.secondary)
                    + Text(placeLabel).foregroundColor(.secondary)
            } else {
                Text(placeLabel).foregroundColor(.secondary)
            }
        }
        .font(.caption)
        .lineLimit(2)
    }

    private func chip(_ value: String) -> some View {
        Text(value)
            .font(.caption.weight(.semibold))
            .foregroundColor(.secondary)
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
            .padding(.horizontal, Self.tagHorizontalPadding)
            .padding(.vertical, Self.tagVerticalPadding)
            .background(Theme.Palette.surface, in: Capsule())
    }

    private var venueName: String? {
        guard !event.isRun, let venue = meta?.venue, !venue.isEmpty else { return nil }
        return venue
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

    private var mapDistance: CLLocationDistance {
        event.isRun ? 9_000 : 420
    }

    private var mapPitch: Double {
        event.isRun ? 50 : 60
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
