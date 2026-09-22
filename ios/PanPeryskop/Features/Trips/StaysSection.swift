import SwiftUI
import CoreLocation

struct StaysSection: View {
    let event: TravelEvent
    let airportCoordinate: CLLocationCoordinate2D?
    let checkin: String?
    let checkout: String?
    var anchors: [StaysAnchor]

    @Environment(\.colorScheme) private var colorScheme
    @State private var anchor: StaysAnchor

    private var showsAnchorFilter: Bool { anchors.count > 1 }

    init(
        event: TravelEvent,
        airportCoordinate: CLLocationCoordinate2D?,
        checkin: String?,
        checkout: String?,
        anchors: [StaysAnchor]? = nil
    ) {
        self.event = event
        self.airportCoordinate = airportCoordinate
        self.checkin = checkin
        self.checkout = checkout
        let resolved = anchors ?? StaysAnchor.options(venueIsAirport: event.venueIsAirport == true)
        self.anchors = resolved
        _anchor = State(initialValue: resolved.first ?? .centre)
    }
    @State private var showsFullSheet = false
    @State private var showsAnchorSheet = false
    @State private var webFailed = false
    @State private var reloadToken = 0
    @State private var isVisible = false
    @State private var hasAppeared = false
    @StateObject private var loader = StaysWidgetLoader()
    private static let mapHeight: CGFloat = 360
    private static let settleDelayMilliseconds = 500

    private var theme: String { colorScheme == .dark ? "dark" : "light" }

    private var mapTrigger: String { "\(isVisible)-\(showsFullSheet)" }

    private var point: StaysAnchorPoint {
        StaysAnchorPoint.resolve(anchor, event: event, airportCoordinate: airportCoordinate)
    }

    private var stayDates: (checkin: String, checkout: String) {
        guard let checkin, let checkout else { return (event.nightBeforeCheckin, event.isoDay) }
        return (checkin, checkout)
    }

    private var query: StaysWidgetQuery {
        StaysWidgetQuery(
            point: point,
            checkin: stayDates.checkin,
            checkout: stayDates.checkout,
            theme: theme,
            view: .mini,
            nearLat: event.lat,
            nearLng: event.lng
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            header
            content
        }
        .padding(.top, Theme.Spacing.section)
        .onScrollVisibilityChange(threshold: 0.1) { isVisible = $0 }
        .task(id: mapTrigger) {
            guard !showsFullSheet else {
                hasAppeared = false
                return
            }
            guard isVisible else { return }
            webFailed = false
            try? await Task.sleep(for: .milliseconds(Self.settleDelayMilliseconds))
            guard !Task.isCancelled else { return }
            hasAppeared = true
        }
        .task(id: query.key) {
            webFailed = false
            await loader.load(query)
        }
        .sheet(isPresented: $showsFullSheet) {
            StaysSheet(
                event: event,
                airportCoordinate: airportCoordinate,
                anchor: $anchor,
                options: anchors,
                checkin: stayDates.checkin,
                checkout: stayDates.checkout,
                onClose: { showsFullSheet = false }
            )
        }
        .sheet(isPresented: $showsAnchorSheet) {
            StaysAnchorSheet(anchor: $anchor, options: anchors)
        }
    }

    private var header: some View {
        TripsSectionHeader(
            title: "Noclegi",
            filterLabel: showsAnchorFilter ? anchor.label : nil,
            onFilter: showsAnchorFilter ? { showsAnchorSheet = true } : nil
        )
        .padding(.horizontal, Theme.Spacing.l)
    }

    @ViewBuilder
    private var content: some View {
        if !hasAppeared {
            skeleton
        } else if let url = loader.url, !webFailed {
            miniMap(url)
        } else if loader.failed || webFailed {
            ErrorState(message: "Nie udało się wczytać noclegów") {
                retry()
            }
            .padding(.horizontal, Theme.Spacing.l)
        } else {
            skeleton
        }
    }

    private var skeleton: some View {
        SkeletonBlock(height: Self.mapHeight, radius: Theme.Radius.card)
            .skeletonPulse()
            .padding(.horizontal, Theme.Spacing.l)
    }

    private func miniMap(_ url: URL) -> some View {
        Stay22MapView(url: url, isInteractive: false) { webFailed = true }
            .id(reloadToken)
            .frame(height: Self.mapHeight)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                    .stroke(Theme.Palette.hairline, lineWidth: 0.5)
            )
            .overlay(tapTarget)
            .padding(.horizontal, Theme.Spacing.l)
    }

    private func retry() {
        webFailed = false
        reloadToken += 1
        Task { await loader.reload(query) }
    }

    private var tapTarget: some View {
        Button {
            Haptics.selection()
            showsFullSheet = true
        } label: {
            Color.clear
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Noclegi")
        .accessibilityHint("Otwiera dużą mapę noclegów")
    }
}
