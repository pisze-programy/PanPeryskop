import SwiftUI

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
    @State private var selectedDestinationIata: String?

    private var destinations: [Destination] { viewModel.nearbyDestinations(for: event) }
    private var reachableAirports: Set<String>? { event.reachableAirports.map(Set.init) }

    private func isReachable(_ iata: String) -> Bool { reachableAirports?.contains(iata) ?? true }

    private var destination: Destination? {
        if let selected = destinations.first(where: { $0.iata == selectedDestinationIata }) { return selected }
        return destinations.first(where: { isReachable($0.iata) }) ?? destinations.first
    }

    var body: some View {
        VStack(spacing: 0) {
            hero
            if destinations.isEmpty {
                noAirportHint
            } else {
                EventFlightSection(
                    event: event,
                    origin: origin,
                    destinations: destinations,
                    destination: destination,
                    reachableAirports: reachableAirports,
                    onSelectDestination: { selectedDestinationIata = $0.iata },
                    viewModel: viewModel
                )
            }
        }
        .padding(.bottom, Theme.Spacing.xl)
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