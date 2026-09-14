import SwiftUI
import CoreLocation

struct TripsEventSheet: View {
    @ObservedObject var viewModel: TripsViewModel
    @State private var activeIndex: Int? = 0
    @State private var detent: PresentationDetent = .medium
    @State private var expanded: PlaceKind?
    @State private var browserURL: URL?
    @State private var browserOffset: CGFloat = 0
    @State private var nights = 1
    @State private var airportCoordinate: CLLocationCoordinate2D?

    private var events: [TravelEvent] { viewModel.selectedEventGroup?.events ?? [] }

    private var currentEvent: TravelEvent? {
        let index = activeIndex ?? 0
        return events.indices.contains(index) ? events[index] : events.first
    }

    private var bottomSafeAreaInset: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }?.safeAreaInsets.bottom ?? 0
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            SheetShell(detent: $detent) {
                if let expanded {
                    PlacesListView(
                        kind: expanded,
                        eventCoordinate: currentCoordinate,
                        airportCoordinate: airportCoordinate,
                        nights: nights,
                        onBack: {
                            self.expanded = nil
                            detent = .medium
                        },
                        onOpenURL: openBrowser
                    )
                } else {
                    pager
                }
            }
            if let browserURL {
                StoryBrowserOverlay(
                    url: browserURL,
                    offset: browserOffset,
                    bottomInset: bottomSafeAreaInset,
                    onClose: closeBrowser
                )
            }
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
        VStack(spacing: 0) {
            PageDots(count: max(events.count, 1), index: activeIndex ?? 0)
                .opacity(events.count > 1 ? 1 : 0)
                .padding(.top, 22)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 0) {
                    ForEach(Array(events.enumerated()), id: \.offset) { index, event in
                        ScrollView(showsIndicators: false) {
                            TripsEventPage(
                                event: event,
                                origin: viewModel.selectedAirport,
                                viewModel: viewModel,
                                isActive: (activeIndex ?? 0) == index,
                                onOpenURL: openBrowser,
                                onExpand: expandPlaces,
                                onPlannerChange: { newNights, coord in
                                    guard (activeIndex ?? 0) == index else { return }
                                    nights = newNights
                                    airportCoordinate = coord
                                }
                            )
                        }
                        .containerRelativeFrame(.horizontal)
                        .id(event.id)
                        .onScrollGeometryChange(for: CGFloat.self) { geometry in
                            geometry.contentOffset.y
                        } action: { _, y in
                            guard (activeIndex ?? 0) == index else { return }
                            handleScroll(y)
                        }
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $activeIndex)
        }
    }

    private func expandPlaces(_ kind: PlaceKind) {
        expanded = kind
        detent = .large
    }

    /// Medium grows to large on scroll down; back to medium at the top.
    private func handleScroll(_ y: CGFloat) {
        if y > 40, detent == .medium {
            detent = .large
        } else if y <= 4, detent == .large {
            detent = .medium
        }
    }

    private func openBrowser(_ url: URL) {
        browserURL = url
        detent = .large
        browserOffset = StoryBrowserOverlay.panelHeight
        DispatchQueue.main.async {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) {
                browserOffset = 0
            }
        }
    }

    private func closeBrowser() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) {
            browserOffset = StoryBrowserOverlay.panelHeight
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.28) {
            browserURL = nil
            browserOffset = 0
        }
    }
}

struct TripsEventPage: View {
    let event: TravelEvent
    let origin: Airport
    @ObservedObject var viewModel: TripsViewModel
    let isActive: Bool
    let onOpenURL: (URL) -> Void
    let onExpand: (PlaceKind) -> Void
    let onPlannerChange: (Int, CLLocationCoordinate2D?) -> Void
    @StateObject private var planner = TripsEventPlanner()

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
        VStack(spacing: 0) {
            ForEach(TripsSheetSection.sections(for: event)) { section in
                sectionView(section)
            }
            priceFooter
        }
        .padding(.bottom, Theme.Spacing.xl)
        .onAppear { report() }
        .onChange(of: isActive) { _, _ in report() }
        .onChange(of: planner.outbound?.date) { _, _ in report() }
        .onChange(of: planner.returning?.date) { _, _ in report() }
        .onChange(of: planner.destination?.iata) { _, _ in report() }
    }

    private func report() {
        guard isActive else { return }
        onPlannerChange(planner.nights, airportCoordinate)
    }

    @ViewBuilder
    private func sectionView(_ section: TripsSheetSection) -> some View {
        switch section {
        case .hero:
            hero
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
            PlacesSection(
                kind: .hotel,
                event: event,
                airportCoordinate: airportCoordinate,
                nights: planner.nights,
                tiers: HotelTier.allCases,
                onOpenURL: onOpenURL,
                onExpand: onExpand
            )
        case .attractions:
            PlacesSection(
                kind: .attraction,
                event: event,
                airportCoordinate: airportCoordinate,
                onOpenURL: onOpenURL,
                onExpand: onExpand
            )
        case .transport:
            TransportSection(planner: planner)
        case .cars:
            PlacesSection(
                kind: .car,
                event: event,
                airportCoordinate: airportCoordinate,
                onOpenURL: onOpenURL,
                onExpand: onExpand
            )
        case .insurance:
            PlacesSection(
                kind: .insurance,
                event: event,
                airportCoordinate: airportCoordinate,
                onOpenURL: onOpenURL,
                onExpand: onExpand
            )
        }
    }

    private var priceFooter: some View {
        TripsSectionFooter(text: "Ceny są orientacyjne i mogą się zmienić u dostawcy. To podgląd oferty.")
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.section)
    }

    @ViewBuilder
    private var hero: some View {
        if event.isRun {
            RunEventBoard(event: event, onOpenURL: onOpenURL)
        } else {
            SoccerMatchBoard(event: event, onOpenURL: onOpenURL)
        }
    }

    private var noAirportHint: some View {
        HStack(spacing: 6) {
            Image(systemName: "airplane.slash")
            Text("Brak lotniska w zasięgu 200 km")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, Theme.Spacing.xl)
    }
}
