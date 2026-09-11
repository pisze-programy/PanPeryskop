import SwiftUI

/// Wycieczki (soccer) event sheet. If the tapped pin is a group, the whole sheet
/// pages across the events with dots at the top; a single event has no pager/dots.
struct SoccerEventSheet: View {
    @ObservedObject var viewModel: TripsViewModel
    @State private var activeIndex = 0

    private var events: [TravelEvent] { viewModel.selectedEventGroup?.events ?? [] }

    var body: some View {
        SheetShell {
            VStack(spacing: 0) {
                if events.count > 1 {
                    PageDots(count: events.count, index: activeIndex)
                }
                TabView(selection: $activeIndex) {
                    ForEach(Array(events.enumerated()), id: \.element.id) { index, event in
                        ScrollView(showsIndicators: false) {
                            SoccerEventPage(event: event, origin: viewModel.selectedAirport, viewModel: viewModel)
                        }
                        .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
            }
        }
        .presentationContentInteraction(.scrolls)
        .onChange(of: viewModel.selectedEventGroup?.id) { _, _ in activeIndex = 0 }
    }
}

/// One event page: match board on top, flight section below.
struct SoccerEventPage: View {
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
            SoccerMatchBoard(event: event)
            if destinations.isEmpty {
                noAirportHint
            } else {
                SoccerFlightSection(
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