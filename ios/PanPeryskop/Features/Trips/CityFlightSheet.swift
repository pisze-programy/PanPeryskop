import SwiftUI
import CoreLocation

/// City-break flights. A dedicated sheet: the airport minimap, then a month
/// calendar per leg, then a sticky buy button. The two calendars keep their own
/// month, so an October outbound with a November return works.
struct CityFlightSheet: View {
    @ObservedObject var viewModel: TripsViewModel
    let city: TravelCity
    @Binding var outbound: FlightWindowCell?
    @Binding var returning: FlightWindowCell?

    @Environment(\.dismiss) private var dismiss
    @State private var detent: PresentationDetent = .large
    @State private var selectedOptionId: String?
    @State private var outboundMonth: Date = Date()
    @State private var returningMonth: Date = Date()
    @State private var outboundWindow: FlightWindowResponse?
    @State private var returningWindow: FlightWindowResponse?
    @State private var outboundFailed = false
    @State private var returningFailed = false

    private static let windowMonths = 3

    var body: some View {
        SheetShell(detent: $detent) {
            NavigationStack {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                        railSection
                        outboundCalendar
                        returningCalendar
                    }
                    .padding(.top, Theme.Spacing.m)
                    .padding(.bottom, Theme.Spacing.xl)
                }
                .safeAreaInset(edge: .bottom, spacing: 0) { buyBar }
                .navigationTitle("Wybierz terminy")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Anuluj") { dismiss() }
                    }
                }
            }
        }
        .task(id: outboundLoadKey) { await loadOutbound() }
        .task(id: returningLoadKey) { await loadReturning() }
    }

    // MARK: - Options

    private var options: [FlightOption] {
        city.connections.flatMap { connection -> [FlightOption] in
            guard let destination = viewModel.destinations.first(where: { $0.iata == connection.iata }) else { return [] }
            return connection.carriers
                .compactMap(Airline.init(rawValue:))
                .sorted { $0.rawValue < $1.rawValue }
                .map { FlightOption(destination: destination, carrier: $0) }
        }
    }

    private var selectedOption: FlightOption? {
        options.first { $0.id == selectedOptionId } ?? options.first
    }

    private func origin(for destination: Destination) -> Airport {
        TripsViewModel.origin(for: destination, among: viewModel.originAirports)
    }

    private var anchorDate: Date { viewModel.anchorDate }

    private var maxMonth: Date {
        AppConstants.warsawCalendar.date(byAdding: .month, value: Self.windowMonths, to: Date()) ?? Date()
    }

    // MARK: - Loading

    private var outboundLoadKey: String {
        "\(selectedOption?.id ?? "")|out|\(FlightPricesService.monthKey(outboundMonth))"
    }

    private var returningLoadKey: String {
        "\(selectedOption?.id ?? "")|ret|\(FlightPricesService.monthKey(returningMonth))"
    }

    private func loadOutbound() async {
        guard let option = selectedOption else { return }
        outboundFailed = false
        let loaded = await FlightPricesService.shared.month(
            airline: option.carrier,
            origin: origin(for: option.destination).iata,
            destination: option.destination.iata,
            month: outboundMonth
        )
        guard !Task.isCancelled else { return }
        guard let loaded else {
            outboundFailed = true
            return
        }
        outboundWindow = loaded
        guard outbound == nil else { return }
        outbound = defaultOutbound(loaded)
        // An outbound near the end of the month puts the return in the next one.
        let target = returnMonth(for: outbound)
        if target != returningMonth { returningMonth = target }
    }

    private func loadReturning() async {
        guard let option = selectedOption else { return }
        returningFailed = false
        let loaded = await FlightPricesService.shared.month(
            airline: option.carrier,
            origin: origin(for: option.destination).iata,
            destination: option.destination.iata,
            month: returningMonth
        )
        guard !Task.isCancelled else { return }
        guard let loaded else {
            returningFailed = true
            return
        }
        returningWindow = loaded
        guard returning == nil else { return }
        returning = defaultReturning(loaded)
    }

    /// The map day picker picks the anchor; the outbound defaults to it.
    private func defaultOutbound(_ window: FlightWindowResponse) -> FlightWindowCell? {
        let anchor = AppConstants.isoDayFormatter.string(from: anchorDate)
        if let exact = window.outbound.first(where: { $0.date == anchor && $0.price != nil }) { return exact }
        if let best = bestPair { return window.outbound.first { $0.date == iso(best.outbound.date) } }
        return cheapest(window.outbound)
    }

    private func defaultReturning(_ window: FlightWindowResponse) -> FlightWindowCell? {
        let after = outbound?.date ?? ""
        if let best = bestPair, iso(best.returning.date) > after {
            return window.returning.first { $0.date == iso(best.returning.date) }
        }
        return window.returning.first { $0.date > after && $0.price != nil } ?? cheapest(window.returning)
    }

    private func returnMonth(for cell: FlightWindowCell?) -> Date {
        let calendar = AppConstants.warsawCalendar
        guard let cell, let date = AppConstants.isoDayFormatter.date(from: cell.date) else {
            return startOfMonth(anchorDate)
        }
        let daysInMonth = calendar.range(of: .day, in: .month, for: date)?.count ?? 30
        let day = calendar.component(.day, from: date)
        let crosses = day > daysInMonth - AppConstants.cityBreakMaxNights
        return calendar.date(byAdding: .month, value: crosses ? 1 : 0, to: startOfMonth(date)) ?? date
    }

    private func startOfMonth(_ date: Date) -> Date {
        let calendar = AppConstants.warsawCalendar
        return calendar.date(from: calendar.dateComponents([.year, .month], from: date)) ?? date
    }

    private var bestPair: FlightPair? {
        guard let out = outboundWindow?.outbound.compactMap(\.cell),
              let ret = returningWindow?.returning.compactMap(\.cell) else { return nil }
        return FlightScoring.findBestCityTrip(outbound: out, returning: ret, anchor: anchorDate)
    }

    private var bestOutboundDate: String? {
        bestPair.map { iso($0.outbound.date) } ?? cheapest(outboundWindow?.outbound)?.date
    }

    private var bestReturnDate: String? {
        bestPair.map { iso($0.returning.date) } ?? cheapest(returningWindow?.returning)?.date
    }

    private func cheapest(_ cells: [FlightWindowCell]?) -> FlightWindowCell? {
        cells?.filter { $0.price != nil }.min { ($0.price ?? 0) < ($1.price ?? 0) }
    }

    private func iso(_ date: Date) -> String {
        AppConstants.isoDayFormatter.string(from: date)
    }

    // MARK: - Views

    private var railSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            TripsSectionHeader(title: "Lotnisko")
                .padding(.horizontal, Theme.Spacing.l)
            if let selected = selectedOption {
                DestinationMapRail(
                    origin: origin(for: selected.destination),
                    options: options,
                    selected: selected,
                    onSelect: { option in
                        selectedOptionId = option.id
                        outboundWindow = nil
                        returningWindow = nil
                        outbound = nil
                        returning = nil
                    }
                )
                .padding(.horizontal, Theme.Spacing.l)
            }
        }
    }

    @ViewBuilder
    private var outboundCalendar: some View {
        if let option = selectedOption {
            calendar(
                title: "Loty \(origin(for: option.destination).iata) → \(option.destination.iata)",
                cells: outboundWindow?.outbound ?? [],
                month: $outboundMonth,
                selected: $outbound,
                bestDate: bestOutboundDate,
                disabledThrough: nil,
                failed: outboundFailed
            )
        }
    }

    @ViewBuilder
    private var returningCalendar: some View {
        if let option = selectedOption {
            calendar(
                title: "Loty \(option.destination.iata) → \(origin(for: option.destination).iata)",
                cells: returningWindow?.returning ?? [],
                month: $returningMonth,
                selected: $returning,
                bestDate: bestReturnDate,
                disabledThrough: outbound?.date,
                failed: returningFailed
            )
        }
    }

    private func calendar(
        title: String,
        cells: [FlightWindowCell],
        month: Binding<Date>,
        selected: Binding<FlightWindowCell?>,
        bestDate: String?,
        disabledThrough: String?,
        failed: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            if failed {
                ErrorState(message: "Nie udało się pobrać lotów") {
                    Task { await loadOutbound() }
                }
                .padding(.horizontal, Theme.Spacing.l)
            } else {
                FlightMonthCalendar(
                    title: title,
                    cells: cells,
                    month: month.wrappedValue,
                    minMonth: Date(),
                    maxMonth: maxMonth,
                    selected: selected,
                    bestDate: bestDate,
                    disabledThrough: disabledThrough,
                    onMonthChange: { month.wrappedValue = $0 }
                )
            }
        }
    }

    private var buyBar: some View {
        VStack(spacing: 0) {
            Divider()
            CapsuleButton(
                title: buyTitle,
                trailingText: hasSelection ? "\(total) zł" : nil,
                tint: selectedOption?.carrier.color ?? .accentColor,
                fullWidth: true,
                isEnabled: hasSelection,
                cornerRadius: Theme.Radius.card,
                action: openBooking
            )
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.s)
        }
        .background(.bar)
    }

    private var total: Int {
        Int((outbound?.price ?? 0) + (returning?.price ?? 0))
    }

    private var hasSelection: Bool { outbound != nil || returning != nil }

    private var hasAnyFare: Bool {
        (outboundWindow?.outbound.contains { $0.price != nil } ?? false)
            || (returningWindow?.returning.contains { $0.price != nil } ?? false)
    }

    private var buyTitle: String {
        if hasSelection { return "Kup w \(selectedOption?.carrier.displayName ?? "")" }
        return hasAnyFare ? "Wybierz terminy aby kupić bilet" : "Bilety wyprzedane"
    }

    private func openBooking() {
        guard let option = selectedOption,
              let url = option.carrier.bookingURL(
                origin: origin(for: option.destination).iata,
                destination: option.destination.iata,
                outbound: outbound?.date,
                returning: returning?.date
              ) else { return }
        UIApplication.shared.open(url)
    }
}
