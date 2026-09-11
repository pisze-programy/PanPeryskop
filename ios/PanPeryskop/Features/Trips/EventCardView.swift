import SwiftUI
import CoreLocation

/// Native bottom sheet (presentationDetents) hosting the run-club-style event
/// page: match card → group pager → destination rail → flights.
struct EventCardView: View {
    @ObservedObject var viewModel: TripsViewModel
    @State private var activeIndex = 0
    @State private var selectedDestinationIata: String?

    private var group: EventGroup? { viewModel.selectedEventGroup }
    private var event: TravelEvent? {
        guard let group, group.events.indices.contains(activeIndex) else { return nil }
        return group.events[activeIndex]
    }
    private var destinations: [Destination] {
        event.map { viewModel.nearbyDestinations(for: $0) } ?? []
    }
    /// Airport IATAs the backend confirmed have flights around the event day;
    /// nil = reachability not computed (treat all nearby airports as eligible).
    private var reachableAirports: Set<String>? {
        event.flatMap { $0.reachableAirports.map(Set.init) }
    }
    private func isReachable(_ iata: String) -> Bool {
        reachableAirports?.contains(iata) ?? true
    }
    private var destination: Destination? {
        if let selected = destinations.first(where: { $0.iata == selectedDestinationIata }) { return selected }
        return destinations.first(where: { isReachable($0.iata) }) ?? destinations.first
    }

    var body: some View {
        SheetShell {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    if let event {
                        MatchCardView(event: event)
                        if let group, group.isGroup {
                            EventPagerRail(events: group.events, activeIndex: $activeIndex)
                        }
                        Divider()
                        if destinations.isEmpty {
                            noAirportHint
                        } else {
                            FlightSection(
                                event: event,
                                origin: viewModel.selectedAirport,
                                destinations: destinations,
                                destination: destination,
                                reachableAirports: reachableAirports,
                                onSelectDestination: { selectedDestinationIata = $0.iata },
                                viewModel: viewModel
                            )
                        }
                    }
                }
            }
        }
        .presentationContentInteraction(.scrolls)
        .onChange(of: viewModel.selectedEventGroup?.id) { _, _ in
            activeIndex = 0
            selectedDestinationIata = nil
        }
        .onChange(of: event?.id) { _, _ in
            selectedDestinationIata = nil
        }
    }

    private var noAirportHint: some View {
        HStack(spacing: 6) {
            Image(systemName: "airplane.slash")
            Text("Brak lotniska w zasięgu 200 km")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 24)
    }
}