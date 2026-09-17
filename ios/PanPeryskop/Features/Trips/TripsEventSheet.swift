import SwiftUI
import CoreLocation

/// Browser policy for an external link. Runs may leave the fixed allow-list
/// because race websites redirect to arbitrary hosts.
enum BrowserAccess {
    case restricted
    case open
}

struct BrowserItem: Identifiable {
    let id = UUID()
    let url: URL
    let access: BrowserAccess
}

private struct MapPickerRequest: Identifiable {
    let id = UUID()
    let coordinate: CLLocationCoordinate2D
    let title: String
}

struct TripsEventSheet: View {
    @ObservedObject var viewModel: TripsViewModel
    @State private var activeIndex: Int? = 0
    @State private var detent: PresentationDetent = .medium
    @State private var expanded: PlaceKind?
    @State private var browserItem: BrowserItem?
    @State private var mapPicker: MapPickerRequest?
    @State private var airportCoordinate: CLLocationCoordinate2D?
    @State private var pageWidth: CGFloat = UIScreen.main.bounds.width
    @State private var scrollTopToken = 0

    private static let warmupDelayMilliseconds = 600

    private var events: [TravelEvent] { viewModel.selectedEventGroup?.events ?? [] }

    private var currentEvent: TravelEvent? {
        let index = activeIndex ?? 0
        return events.indices.contains(index) ? events[index] : events.first
    }

    var body: some View {
        SheetShell(detent: $detent) {
            pager
        }
        .task {
            try? await Task.sleep(for: .milliseconds(Self.warmupDelayMilliseconds))
            WebKitWarmup.warm()
        }
        .sheet(item: $expanded) { kind in
            PlacesListSheet(
                kind: kind,
                eventCoordinate: currentCoordinate,
                eventDay: currentEvent?.isoDay ?? "",
                onClose: { expanded = nil }
            )
        }
        .sheet(item: $browserItem) { item in
            InAppBrowserView(
                url: item.url,
                allowAnyHost: item.access == .open,
                onClose: { browserItem = nil }
            )
            .presentationDetents([.medium, .large])
        }
        .sheet(item: $mapPicker) { request in
            MapAppPickerSheet(coordinate: request.coordinate, title: request.title)
        }
        .onChange(of: viewModel.selectedEventGroup?.id) { _, _ in
            activeIndex = 0
            expanded = nil
            detent = .medium
        }
    }

    private var currentCoordinate: CLLocationCoordinate2D {
        guard let event = currentEvent else { return CLLocationCoordinate2D(latitude: 0, longitude: 0) }
        return CLLocationCoordinate2D(latitude: event.lat, longitude: event.lng)
    }

    private var pager: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 0) {
                ForEach(Array(events.enumerated()), id: \.offset) { index, event in
                    TripsEventPage(
                        event: event,
                        origin: viewModel.selectedAirport,
                        viewModel: viewModel,
                        isActive: (activeIndex ?? 0) == index,
                        dotsCount: events.count,
                        dotsIndex: index,
                        scrollTopToken: scrollTopToken,
                        onTapHeader: { scrollTopToken += 1 },
                        onOpenURL: openBrowser,
                        onOpenMap: { coordinate, title in
                            mapPicker = MapPickerRequest(coordinate: coordinate, title: title)
                        },
                        onExpand: expandPlaces,
                        onPlannerChange: { coord in
                            guard (activeIndex ?? 0) == index else { return }
                            airportCoordinate = coord
                        }
                    )
                    .frame(width: pageWidth)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $activeIndex)
        .scrollDisabled(events.count <= 1)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { _, width in
            pageWidth = width
        }
    }

    private func expandPlaces(_ kind: PlaceKind) {
        expanded = kind
    }

    private func openBrowser(_ url: URL, access: BrowserAccess) {
        browserItem = BrowserItem(url: url, access: access)
        detent = .large
    }
}

struct TripsEventPage: View {
    let event: TravelEvent
    let origin: Airport
    @ObservedObject var viewModel: TripsViewModel
    let isActive: Bool
    let dotsCount: Int
    let dotsIndex: Int
    let scrollTopToken: Int
    let onTapHeader: () -> Void
    let onOpenURL: (URL, BrowserAccess) -> Void
    let onOpenMap: (CLLocationCoordinate2D, String) -> Void
    let onExpand: (PlaceKind) -> Void
    let onPlannerChange: (CLLocationCoordinate2D?) -> Void
    @StateObject private var planner = TripsEventPlanner()

    private static let topId = "trips-page-top"

    private var destinations: [Destination] { viewModel.nearbyDestinations(for: event) }
    private var reachableAirports: Set<String>? { event.reachableAirports.map(Set.init) }

    private func isReachable(_ iata: String) -> Bool { reachableAirports?.contains(iata) ?? true }

    private var destination: Destination? {
        if let selected = planner.destination, destinations.contains(where: { $0.iata == selected.iata }) { return selected }
        return destinations.first(where: { isReachable($0.iata) }) ?? destinations.first
    }

    private var airportCoordinate: CLLocationCoordinate2D? {
        destination.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) }
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    Color.clear
                        .frame(height: 0)
                        .id(Self.topId)
                    ForEach(TripsSheetSection.sections(for: event)) { section in
                        sectionView(section)
                    }
                    priceFooter
                }
                .padding(.bottom, Theme.Spacing.xl)
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                TripsGamestrip(
                    event: event,
                    dotsCount: dotsCount,
                    dotsIndex: dotsIndex,
                    onTap: { onTapHeader() }
                )
            }
            .onChange(of: scrollTopToken) { _, _ in
                guard isActive else { return }
                withAnimation(AppConstants.springStandard) {
                    proxy.scrollTo(Self.topId, anchor: .top)
                }
            }
        }
        .onAppear { report() }
        .onChange(of: isActive) { _, _ in report() }
        .onChange(of: planner.outbound?.date) { _, _ in report() }
        .onChange(of: planner.returning?.date) { _, _ in report() }
        .onChange(of: planner.destination?.iata) { _, _ in report() }
    }

    private func report() {
        guard isActive else { return }
        onPlannerChange(airportCoordinate)
    }

    @ViewBuilder
    private func sectionView(_ section: TripsSheetSection) -> some View {
        switch section {
        case .hero:
            heroDetails
        case .flights:
            if destinations.isEmpty {
                noAirportHint
            } else {
                EventFlightSection(
                    event: event,
                    origin: origin,
                    destinations: destinations,
                    destination: destination,
                    reachableAirports: reachableAirports,
                    onSelectDestination: { planner.destination = $0 },
                    planner: planner,
                    viewModel: viewModel,
                    isActive: isActive
                )
            }
        case .stays:
            StaysSection(
                event: event,
                airportCoordinate: airportCoordinate,
                checkin: planner.outbound?.date,
                checkout: planner.returning?.date
            )
        case .attractions:
            PlacesSection(
                kind: .attraction,
                event: event,
                onOpenURL: { onOpenURL($0, .restricted) },
                onExpand: onExpand
            )
        }
    }

    private var priceFooter: some View {
        TripsSectionFooter(text: "Ceny są orientacyjne i mogą się zmienić u dostawcy.")
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.section)
    }

    private var heroDetails: some View {
        TripsEventDetail(event: event, onOpenURL: onOpenURL, onOpenMap: onOpenMap)
    }

    private var noAirportHint: some View {
        HStack(spacing: Self.emptyHintSpacing) {
            Image(systemName: "airplane.slash")
            Text("Brak lotniska w zasięgu \(Self.nearbyRadiusKilometers) km")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, Theme.Spacing.xl)
    }

    private static let emptyHintSpacing: CGFloat = 6
    private static let metersPerKilometer = 1000.0
    private static let nearbyRadiusKilometers = Int(AppConstants.nearbyAirportRadiusMeters / metersPerKilometer)
}
