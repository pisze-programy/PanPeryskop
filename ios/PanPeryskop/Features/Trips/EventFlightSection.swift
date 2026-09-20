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
    @State private var mode: TransportMode = .flight
    @State private var showsModeSheet = false
    @State private var busWindow: BusWindowResponse?
    @State private var busFailed = false
    @State private var busDay: Date?

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
                title: mode == .flight ? "Wybierz lot" : "Transport publiczny",
                filterLabel: mode.label,
                onFilter: { showsModeSheet = true }
            )
            .padding(.horizontal, Theme.Spacing.l)
            switch mode {
            case .flight:
                mapRail
                board
            case .bus:
                busContent
            }
        }
        .padding(.top, Theme.Spacing.section)
        .sheet(isPresented: $showsModeSheet) {
            TransportModeSheet(mode: $mode)
        }
        .task(id: loadTrigger) {
            guard isActive else { return }
            guard mode == .flight else { return }
            await loadSelected()
        }
        .task(id: busTrigger) {
            guard isActive else { return }
            guard mode == .bus else { return }
            await loadBus()
        }
    }

    private var loadTrigger: String { "\(event.id)|\(selectedOption?.id ?? "")|\(isActive)" }
    private var busTrigger: String { "\(event.id)|\(isActive)|\(mode.rawValue)|\(AppConstants.isoDayFormatter.string(from: selectedBusDay))" }

    /// The event day is the latest a bus can leave: you must arrive before it.
    private var eventBusDay: Date {
        let day = Date(timeIntervalSince1970: TimeInterval(event.start_ms) / 1000)
        return AppConstants.warsawCalendar.startOfDay(for: day)
    }

    /// A week of departures ending on the event day, so the tab strip opens on it.
    private var busDays: [Date] {
        let calendar = AppConstants.warsawCalendar
        return (0...7).reversed().map { calendar.date(byAdding: .day, value: -$0, to: eventBusDay) ?? eventBusDay }
    }

    private var selectedBusDay: Date { busDay ?? eventBusDay }

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

    @ViewBuilder
    private var busContent: some View {
        BusDayStrip(days: busDays, selected: selectedBusDay) { day in
            busDay = day
        }
        if busFailed {
            ErrorState(message: "Nie udało się pobrać połączeń") {
                Task { await loadBus() }
            }
            .padding(.horizontal, Theme.Spacing.l)
        } else if let window = busWindow {
            if window.offers.isEmpty {
                busEmpty
            } else {
                busCard(window)
            }
        } else {
            BusSkeleton()
                .padding(.horizontal, Theme.Spacing.l)
        }
    }

    /// Up to three departures: the cheapest first, then the earliest of the day.
    private func busPreview(_ offers: [BusOffer]) -> [BusOffer] {
        let byHour = offers.sorted { $0.hour < $1.hour }
        let preview = Array(byHour.prefix(3))
        guard let cheapest = offers.min(by: { $0.price < $1.price }) else { return preview }
        if preview.contains(where: { $0.id == cheapest.id }) {
            return [cheapest] + preview.filter { $0.id != cheapest.id }
        }
        return [cheapest] + preview.prefix(2)
    }

    private func busCard(_ window: BusWindowResponse) -> some View {
        let rows = busPreview(window.offers)
        let from = window.from?.name ?? viewModel.selectedCity.name
        let to = window.to?.name ?? event.city
        return Button {
            Haptics.selection()
            openBusBooking(window.bookUrl)
        } label: {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                HStack(spacing: Theme.Spacing.s) {
                    Image(systemName: "bus.fill")
                        .foregroundColor(Theme.Palette.partnerGreen)
                    Text("\(from) → \(to)")
                        .font(.headline)
                        .foregroundColor(.primary)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.secondary)
                }
                VStack(spacing: Theme.Spacing.s) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, offer in
                        busRow(offer, isCheapest: index == 0)
                    }
                }
            }
            .padding(Theme.Spacing.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, Theme.Spacing.l)
    }

    private func busRow(_ offer: BusOffer, isCheapest: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
            Text(offer.hour)
                .font(.subheadline.weight(.semibold))
                .frame(width: 46, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(Self.durationLabel(offer.durationMinutes))
                    .font(.caption)
                    .foregroundColor(.secondary)
                if offer.transfers > 0 {
                    Text("\(offer.transfers) przesiadka")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            Spacer(minLength: 0)
            Text("\(offer.price) zł")
                .font(.headline)
                .foregroundColor(isCheapest ? Theme.Palette.partnerGreen : .primary)
        }
    }

    private var busEmpty: some View {
        HStack(spacing: 6) {
            Image(systemName: "bus")
            Text("Brak połączeń busem do \(busWindow?.to?.name ?? event.city)")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, Theme.Spacing.xl)
        .padding(.horizontal, Theme.Spacing.l)
    }

    private func openBusBooking(_ raw: String?) {
        guard let raw, let url = URL(string: raw) else { return }
        UIApplication.shared.open(url)
    }

    private func loadBus() async {
        busFailed = false
        busWindow = nil
        do {
            let result = try await BusPricesService.shared.bus(
                fromCity: viewModel.selectedCity.name,
                toCity: event.city,
                eventDay: selectedBusDay
            )
            guard !Task.isCancelled else { return }
            busWindow = result
        } catch {
            guard !Task.isCancelled else { return }
            busFailed = true
        }
    }

    private static func durationLabel(_ minutes: Int) -> String {
        let h = minutes / 60
        let m = minutes % 60
        return m == 0 ? "\(h) h" : "\(h) h \(m) min"
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
