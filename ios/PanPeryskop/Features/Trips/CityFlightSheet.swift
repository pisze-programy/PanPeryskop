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
    @State private var outboundMonth: Date
    @State private var returningMonth: Date
    @State private var outboundWindow: FlightWindowResponse?
    @State private var returningWindow: FlightWindowResponse?
    @State private var outboundFailed = false
    @State private var returningFailed = false

    private static let windowMonths = 3

    init(
        viewModel: TripsViewModel,
        city: TravelCity,
        outbound: Binding<FlightWindowCell?>,
        returning: Binding<FlightWindowCell?>
    ) {
        self.viewModel = viewModel
        self.city = city
        self._outbound = outbound
        self._returning = returning
        // The day picked on the map decides the month the calendar opens on.
        let start = Self.startOfMonth(viewModel.anchorDate)
        self._outboundMonth = State(initialValue: start)
        self._returningMonth = State(initialValue: Self.returnMonth(after: start))
    }

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

    /// Built from the city's airports, not from the day's connections: a city
    /// with no flight today still opens its calendar. The carriers come from the
    /// day when known, otherwise both are asked.
    private var options: [FlightOption] {
        city.airports.flatMap { iata -> [FlightOption] in
            guard let destination = viewModel.destinations.first(where: { $0.iata == iata }) else { return [] }
            let known = city.connections.first(where: { $0.iata == iata })?.carriers ?? []
            let carriers = known.compactMap(Airline.init(rawValue:)).sorted { $0.rawValue < $1.rawValue }
            let airlines = carriers.isEmpty ? [Airline.ryanair, Airline.wizzair] : carriers
            return airlines.map { FlightOption(destination: destination, carrier: $0) }
        }
    }

    private var selectedOption: FlightOption? {
        options.first { $0.id == selectedOptionId } ?? options.first
    }

    private func origin(for destination: Destination) -> Airport {
        TripsViewModel.origin(for: destination, among: viewModel.originAirports)
    }

    /// The carrier may fly from a sibling airport of the origin city: Wizzair
    /// answers a Warsaw Chopin request from Modlin. The response says which.
    private var outboundStation: FlightStation? {
        outboundWindow?.outboundStation ?? returningWindow?.outboundStation
    }

    private var returningStation: FlightStation? {
        returningWindow?.returningStation ?? outboundWindow?.returningStation
    }

    private var realOrigin: Airport? {
        guard let option = selectedOption else { return nil }
        guard let iata = outboundStation?.from else { return origin(for: option.destination) }
        return viewModel.originAirports.first { $0.iata == iata } ?? origin(for: option.destination)
    }

    private func legTitle(_ from: String, _ to: String) -> String {
        "Loty \(from) → \(to)"
    }

    private var anchorDate: Date { viewModel.anchorDate }

    private var maxMonth: Date { Self.maxMonthDate }

    /// The return opens on the month after the outbound, capped at the range end:
    /// a December outbound keeps both calendars in December.
    private static func returnMonth(after month: Date) -> Date {
        let calendar = AppConstants.warsawCalendar
        let next = calendar.date(byAdding: .month, value: 1, to: month) ?? month
        return min(next, maxMonthDate)
    }

    private static var maxMonthDate: Date {
        let calendar = AppConstants.warsawCalendar
        return calendar.date(byAdding: .month, value: windowMonths, to: startOfMonth(Date())) ?? Date()
    }

    private static func startOfMonth(_ date: Date) -> Date {
        let calendar = AppConstants.warsawCalendar
        return calendar.date(from: calendar.dateComponents([.year, .month], from: date)) ?? date
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
        if outbound == nil || !isInMonth(outbound?.date, month: outboundMonth) {
            outbound = defaultOutbound(loaded)
        }
        // Keep the return one month ahead of the outbound it defaulted to.
        let target = Self.returnMonth(after: Self.startOfMonth(outboundMonth))
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
        if returning == nil || !isInMonth(returning?.date, month: returningMonth) {
            returning = defaultReturning(loaded)
        }
    }

    /// The month on screen decides the selection: a new month always marks its
    /// best day, so the calendar never opens on an arbitrary first fare.
    private func defaultOutbound(_ window: FlightWindowResponse) -> FlightWindowCell? {
        let anchor = AppConstants.isoDayFormatter.string(from: anchorDate)
        if let exact = window.outbound.first(where: { $0.date == anchor && $0.price != nil }) { return exact }
        if let best = bestPair, isInMonth(iso(best.outbound.date), month: outboundMonth) {
            return window.outbound.first { $0.date == iso(best.outbound.date) }
        }
        return cheapest(window.outbound)
    }

    private func defaultReturning(_ window: FlightWindowResponse) -> FlightWindowCell? {
        let after = outbound?.date ?? ""
        if let best = bestPair, iso(best.returning.date) > after, isInMonth(iso(best.returning.date), month: returningMonth) {
            return window.returning.first { $0.date == iso(best.returning.date) }
        }
        return cheapest(window.returning.filter { $0.date > after }) ?? cheapest(window.returning)
    }

    private func isInMonth(_ isoDay: String?, month: Date) -> Bool {
        guard let isoDay else { return false }
        return isoDay.hasPrefix(String(FlightPricesService.monthKey(month).prefix(7)))
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
        if let best = bestPair, isInMonth(iso(best.outbound.date), month: outboundMonth) {
            return iso(best.outbound.date)
        }
        return cheapest(outboundWindow?.outbound)?.date
    }

    private var bestReturnDate: String? {
        if let best = bestPair, isInMonth(iso(best.returning.date), month: returningMonth) {
            return iso(best.returning.date)
        }
        return cheapest(returningWindow?.returning)?.date
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
            if let selected = selectedOption, let origin = realOrigin {
                DestinationMapRail(
                    origin: origin,
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
                title: legTitle(outboundStation?.from ?? origin(for: option.destination).iata, outboundStation?.to ?? option.destination.iata),
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
                title: legTitle(returningStation?.from ?? option.destination.iata, returningStation?.to ?? origin(for: option.destination).iata),
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
        guard let option = selectedOption else { return }
        let from = outboundStation?.from ?? origin(for: option.destination).iata
        let to = outboundStation?.to ?? option.destination.iata
        guard let url = option.carrier.bookingURL(
            origin: from,
            destination: to,
            outbound: outbound?.date,
            returning: returning?.date
        ) else { return }
        UIApplication.shared.open(url)
    }
}
