import SwiftUI

struct EventFlightSection: View {
    let event: TravelEvent
    let origins: [Airport]
    let destinations: [Destination]
    let destination: Destination?
    var reachableAirports: Set<String>? = nil
    /// Per destination IATA: carriers with flights around the event day. nil = show all.
    var reachableCarriers: [String: [String]]? = nil
    let onSelectDestination: (Destination) -> Void
    @ObservedObject var planner: TripsEventPlanner
    @ObservedObject var viewModel: TripsViewModel
    let isActive: Bool

    @State private var windows: [String: FlightWindowResponse] = [:]
    @State private var failed: Set<String> = []
    @State private var hidden: Set<String> = []
    @State private var selectedId: String?

    private var allOptions: [FlightOption] {
        let options = reachableDestinations.flatMap { destination -> [FlightOption] in
            let allowed = reachableCarriers?[destination.iata]
            return destination.providers
                .filter { allowed?.contains($0.rawValue) ?? true }
                .sorted { $0.rawValue < $1.rawValue }
                .map { FlightOption(destination: destination, carrier: $0) }
        }
        return options
    }

    private var options: [FlightOption] {
        allOptions.filter { !hidden.contains($0.id) }
    }

    private var selectedOption: FlightOption? {
        guard let selectedId else { return options.first }
        return options.first { $0.id == selectedId } ?? options.first
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TripsSectionHeader(
                title: "Wybierz lot",
                info: "Tip: możesz kupić lot w jedną stronę i wrócić z innego lotniska."
            )
            .padding(.horizontal, Theme.Spacing.l)
            mapRail
            board
        }
        .padding(.top, Theme.Spacing.section)
        .task(id: loadTrigger) {
            guard isActive else { return }
            await loadSelected()
        }
    }

    private var loadTrigger: String { "\(event.id)|\(selectedOption?.id ?? "")|\(isActive)" }

    @ViewBuilder
    private var mapRail: some View {
        if let selected = selectedOption {
            DestinationMapRail(
                origin: origin(for: selected.destination),
                options: options,
                selected: selected,
                onSelect: { option in
                    selectedId = option.id
                    onSelectDestination(option.destination)
                }
            )
            .padding(.horizontal, Theme.Spacing.l)
        }
    }

    @ViewBuilder
    private var board: some View {
        if let option = selectedOption {
            CarrierFlightCard(
                carrier: option.carrier,
                event: event,
                originIata: origin(for: option.destination).iata,
                destinationIata: option.destination.iata,
                window: windows[option.id],
                isFailed: failed.contains(option.id),
                selectedOutbound: $planner.outbound,
                selectedReturn: $planner.returning,
                onRetry: { retry(option) }
            )
        }
    }

    private var reachableDestinations: [Destination] {
        destinations.filter { reachableAirports?.contains($0.iata) ?? true }
    }

    private func origin(for destination: Destination) -> Airport {
        TripsViewModel.origin(for: destination, among: origins)
    }

    private func retry(_ option: FlightOption) {
        Task { await load(option) }
    }

    private func loadSelected() async {
        guard let option = selectedOption else { return }
        await load(option)
    }

    private func load(_ option: FlightOption) async {
        failed.remove(option.id)
        let day = Date(timeIntervalSince1970: TimeInterval(event.start_ms) / 1000)
        let window = await FlightPricesService.shared.flights(
            airline: option.carrier,
            origin: origin(for: option.destination).iata,
            destination: option.destination.iata,
            eventDay: day
        )
        guard !Task.isCancelled else { return }
        guard let window else {
            failed.insert(option.id)
            return
        }
        guard !window.outbound.isEmpty || !window.returning.isEmpty else {
            hide(option)
            return
        }
        windows[option.id] = window
        applyBestSelection(window)
    }

    private func hide(_ option: FlightOption) {
        hidden.insert(option.id)
        guard selectedId == option.id else { return }
        selectedId = options.first?.id
    }

    private func applyBestSelection(_ window: FlightWindowResponse) {
        guard let best = bestPair(window) else {
            planner.clearFlightSelection()
            return
        }
        planner.outbound = window.outbound.first { $0.date == Self.dayKey(best.outbound.date) }
        planner.returning = window.returning.first { $0.date == Self.dayKey(best.returning.date) }
    }

    private func bestPair(_ window: FlightWindowResponse) -> FlightPair? {
        FlightScoring.findBestFlight(
            outbound: window.outbound.compactMap { $0.cell },
            returning: window.returning.compactMap { $0.cell },
            eventDate: Date(timeIntervalSince1970: TimeInterval(event.start_ms) / 1000)
        )
    }

    private static func dayKey(_ date: Date) -> String {
        AppConstants.isoDayFormatter.string(from: date)
    }
}
