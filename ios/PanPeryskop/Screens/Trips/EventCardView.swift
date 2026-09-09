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
    private var destination: Destination? {
        destinations.first { $0.iata == selectedDestinationIata } ?? destinations.first
    }

    var body: some View {
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
                            onSelectDestination: { selectedDestinationIata = $0.iata },
                            viewModel: viewModel
                        )
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(.regularMaterial)
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