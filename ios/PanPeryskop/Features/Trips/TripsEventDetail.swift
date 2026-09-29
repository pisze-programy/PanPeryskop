import SwiftUI
import CoreLocation

/// Everything under the gamestrip on a trips page. Both event kinds use this one
/// layout; only the texts, the distance chips and the buttons differ.
struct TripsEventDetail: View {
    let event: TravelEvent
    let onOpenURL: (URL, BrowserAccess) -> Void
    let onOpenMap: (CLLocationCoordinate2D, String) -> Void

    private static let tagSpacing = Theme.Spacing.xs
    private static let separator = ", "
    private static let distanceTitle = "Dystans:"

    @State private var distancesWidth: CGFloat = 0
    @State private var distancesContainer: CGFloat = 0
    @Environment(\.region) private var region

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
            actionButtons
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.m)
        .padding(.bottom, Theme.Spacing.m)
    }

    @ViewBuilder
    private var actionButtons: some View {
        if let tickets = ticketsURL {
            CapsuleButton(title: "Bilety", fullWidth: true) {
                openExternally(tickets)
            }
        }
        if let details = detailsURL {
            CapsuleButton(title: detailsTitle, trailingText: detailsTrailing, fullWidth: true) {
                onOpenURL(details.url, details.access)
            }
        }
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
        DistanceTag(label: value)
    }

    private var venueName: String? {
        guard !event.isRun, let venue = meta?.venue, !venue.isEmpty else { return nil }
        return venue
    }

    private var distanceTags: [String] {
        guard event.isRun else { return [] }
        return RunDistances.tags(meta, language: region.languageCode)
    }

    private var placeLabel: String {
        event.placeName(language: region.languageCode)
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

    private var ticketsURL: URL? {
        URL.normalized(event.link).flatMap(searchURL)
    }

    private var detailsURL: (url: URL, access: BrowserAccess)? {
        if event.isRun {
            guard let url = URL.normalized(meta?.website) else { return nil }
            return (url, .open)
        }
        guard let url = URL.normalized(meta?.matchUrl) else { return nil }
        return (url, .restricted)
    }

    private var priceLabel: String? {
        guard event.isRun, let price = meta?.price, !price.isEmpty else { return nil }
        return price
    }

    private var detailsTitle: String {
        event.isRun ? "Zapisz się" : "Szczegóły meczu"
    }

    private var detailsTrailing: String? {
        priceLabel
    }

    private func searchURL(_ url: URL) -> URL? {
        url.host?.hasSuffix("google.com") == true ? url : nil
    }

    private func openExternally(_ url: URL) {
        MetaSignals.checkout(kind: .event, id: event.id, name: event.title)
        Haptics.selection()
        UIApplication.shared.open(url)
    }
}
