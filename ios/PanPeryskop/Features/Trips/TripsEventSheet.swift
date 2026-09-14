import SwiftUI
import CoreLocation

/// Wycieczki event sheet. If the tapped pin is a group, the whole sheet pages
/// across the events with dots at the top; a single event has no pager/dots.
/// The hero is picked per event tag (soccer match board vs. run board).
struct TripsEventSheet: View {
    @ObservedObject var viewModel: TripsViewModel
    @State private var activeIndex: Int? = 0

    private var events: [TravelEvent] { viewModel.selectedEventGroup?.events ?? [] }

    var body: some View {
        SheetShell {
            VStack(spacing: 0) {
                // Reserve the same space above the hero for a group (dots) and a
                // single event (no dots) so the gap to the sheet handle is identical.
                PageDots(count: max(events.count, 1), index: activeIndex ?? 0)
                    .opacity(events.count > 1 ? 1 : 0)
                    .padding(.top, 22)
                // A plain paging ScrollView (same pattern as ShowtimesPager) instead
                // of a UIKit page TabView, so the sheet can track the content scroll
                // and grow/collapse with it (medium ↔ large ↔ dismiss).
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 0) {
                        ForEach(Array(events.enumerated()), id: \.offset) { _, event in
                            ScrollView(showsIndicators: false) {
                                TripsEventPage(event: event, origin: viewModel.selectedAirport, viewModel: viewModel)
                            }
                            .containerRelativeFrame(.horizontal)
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.paging)
                .scrollPosition(id: $activeIndex)
            }
        }
        .presentationContentInteraction(.scrolls)
        .onChange(of: viewModel.selectedEventGroup?.id) { _, _ in activeIndex = 0 }
    }
}

/// One event page: the tag-specific hero on top, flight section below.
struct TripsEventPage: View {
    let event: TravelEvent
    let origin: Airport
    @ObservedObject var viewModel: TripsViewModel
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
        }
        .padding(.bottom, Theme.Spacing.xl)
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
                    viewModel: viewModel
                )
            }
        case .stays:
            PlacesSection(
                kind: .hotel,
                event: event,
                airportCoordinate: airportCoordinate,
                info: "Wybierz nocleg. Filtr ustawia kolejność: najtaniej, najlepiej oceniane lub premium.",
                tiers: HotelTier.allCases,
                selectedId: planner.hotel?.id,
                onSelect: { planner.hotel = $0 }
            )
        case .attractions:
            PlacesSection(
                kind: .attraction,
                event: event,
                airportCoordinate: airportCoordinate,
                info: "Sugerowane atrakcje w okolicy wydarzenia. Bilety kupisz u organizatora.",
                selectedId: planner.attraction?.id,
                onSelect: { planner.attraction = $0 }
            )
        case .transport:
            TransportSection(planner: planner)
        case .cars:
            PlacesSection(
                kind: .car,
                event: event,
                airportCoordinate: airportCoordinate,
                selectedId: planner.car?.id,
                onSelect: { planner.car = $0 }
            )
        case .insurance:
            PlacesSection(
                kind: .insurance,
                event: event,
                airportCoordinate: airportCoordinate,
                onSelect: { _ in }
            )
        }
    }

    @ViewBuilder
    private var hero: some View {
        if event.isRun {
            RunEventBoard(event: event)
        } else {
            SoccerMatchBoard(event: event)
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