import SwiftUI
import CoreLocation
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
        let start = FlightPickerRules.openingMonth(
            now: viewModel.anchorDate,
            maxNights: AppConstants.cityBreakMaxNights
        )
        self._outboundMonth = State(initialValue: start)
        self._returningMonth = State(initialValue: start)
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
    private var options: [FlightOption] {
        let wanted = Set(city.airports)
        return viewModel.destinations
            .filter { wanted.contains($0.iata) }
            .flatMap { destination in
                destination.providers
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

    private var maxMonth: Date { Self.maxMonthDate }

    private static var maxMonthDate: Date {
        let calendar = AppConstants.warsawCalendar
        return calendar.date(byAdding: .month, value: windowMonths, to: FlightPickerRules.monthStart(Date())) ?? Date()
    }

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
    }


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
                selected: Binding(
                    get: { outbound },
                    set: { picked in
                        outbound = picked
                        clearInvalidReturn()
                        moveReturningMonthIfNeeded()
                    }
                ),
                disabledThrough: nil,
                failed: outboundFailed,
                onRetry: { await loadOutbound() }
            )
        }
    }

    @ViewBuilder
    private var returningCalendar: some View {
        if outbound == nil {
            noOutboundHint
        } else if let option = selectedOption {
            calendar(
                title: legTitle(returningStation?.from ?? option.destination.iata, returningStation?.to ?? origin(for: option.destination).iata),
                cells: returningWindow?.returning ?? [],
                month: $returningMonth,
                selected: $returning,
                disabledThrough: outbound?.date,
                disabledAfter: latestReturn,
                failed: returningFailed,
                onRetry: { await loadReturning() }
            )
        }
    }

    private var noOutboundHint: some View {
        Text("Najpierw wybierz dzień wylotu")
            .font(.footnote)
            .foregroundColor(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.Spacing.l)
    }

    private var latestReturn: String? {
        guard let outbound = outbound?.date else { return nil }
        return FlightPickerRules.latestReturn(after: outbound, maxNights: AppConstants.cityBreakMaxNights)
    }

    private func calendar(
        title: String,
        cells: [FlightWindowCell],
        month: Binding<Date>,
        selected: Binding<FlightWindowCell?>,
        disabledThrough: String?,
        disabledAfter: String? = nil,
        failed: Bool,
        onRetry: @escaping () async -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            if failed {
                ErrorState(message: "Nie udało się pobrać lotów") {
                    Task { await onRetry() }
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
                    disabledThrough: disabledThrough,
                    disabledAfter: disabledAfter,
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

    private var hasSelection: Bool { outbound != nil }

    private var hasAnyFare: Bool {
        (outboundWindow?.outbound.contains { $0.price != nil } ?? false)
            || (returningWindow?.returning.contains { $0.price != nil } ?? false)
    }

    private var buyTitle: String {
        if hasSelection { return "Kup w \(selectedOption?.carrier.displayName ?? "")" }
        if isLoadingFares { return "Ładowanie…" }
        return hasAnyFare ? "Wybierz terminy aby kupić bilet" : "Bilety wyprzedane"
    }

    private var isLoadingFares: Bool {
        outboundWindow == nil && returningWindow == nil && !outboundFailed && !returningFailed
    }

    private func clearInvalidReturn() {
        guard let out = outbound?.date else {
            returning = nil
            return
        }
        guard let back = returning?.date,
              !FlightPickerRules.isReturnAllowed(back, after: out, maxNights: AppConstants.cityBreakMaxNights)
        else { return }
        returning = nil
    }

    private func moveReturningMonthIfNeeded() {
        guard let outbound = outbound,
              let date = AppConstants.isoDayFormatter.date(from: outbound.date) else { return }
        let month = FlightPickerRules.monthStart(date)
        guard month > returningMonth else { return }
        returningMonth = min(month, maxMonth)
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
