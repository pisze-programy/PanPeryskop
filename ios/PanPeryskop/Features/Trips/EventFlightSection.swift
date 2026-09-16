import SwiftUI

struct EventFlightSection: View {
    let event: TravelEvent
    let origin: Airport
    let destinations: [Destination]
    let destination: Destination?
    var reachableAirports: Set<String>? = nil
    let onSelectDestination: (Destination) -> Void
    @ObservedObject var planner: TripsEventPlanner
    @ObservedObject var viewModel: TripsViewModel
    let isActive: Bool

    @State private var window: FlightWindowResponse?
    @State private var loadFailed = false
    @State private var isLoading = false

    private let airline: Airline = .ryanair
    private var loadKey: String { "\(event.id)|\(destination?.iata ?? "")" }
    private var loadTrigger: String { "\(loadKey)|\(isActive)" }

    private static let sideFadeInset: CGFloat = 0.06
    private static let sideFadeOutset: CGFloat = 0.94
    private static let minimumSkeletonDuration: TimeInterval = 0.15
    private static let nanosecondsPerSecond: UInt64 = 1_000_000_000
    private static let stripHeight = FlightTimeline.cellHeight + 2 * Theme.Spacing.xs

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TripsSectionHeader(
                title: "Wybierz lot",
                info: "Tip: możesz kupić lot w jedną stronę i wrócić z innego lotniska."
            )
            .padding(.horizontal, Theme.Spacing.l)
            mapRail
            card
            buyArea
        }
        .padding(.top, Theme.Spacing.section)
        .task(id: loadTrigger) {
            guard isActive else { return }
            await fetchPrices()
        }
    }

    @ViewBuilder
    private var mapRail: some View {
        if let selected = destination ?? reachableDestinations.first {
            DestinationMapRail(
                origin: origin,
                destinations: reachableDestinations,
                selected: selected,
                onSelect: onSelectDestination
            )
            .padding(.horizontal, Theme.Spacing.l)
        }
    }

    @ViewBuilder
    private var buyArea: some View {
        if let destination, window != nil {
            buyBar(destination)
                .padding(.horizontal, Theme.Spacing.l)
        } else if !loadFailed {
            ctaPlaceholder
                .padding(.horizontal, Theme.Spacing.l)
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            if loadFailed, window == nil {
                ErrorState(message: "Nie udało się pobrać lotów") {
                    loadFailed = false
                    Task { await fetchPrices() }
                }
                .padding(.horizontal, Theme.Spacing.l)
            } else {
                ticketStrip
            }
        }
        .padding(.vertical, Theme.Spacing.m)
        .frame(maxWidth: .infinity)
        .background(Theme.Palette.surface)
        .overlay {
            if isLoading, window != nil {
                ProgressView()
                    .padding(Theme.Spacing.s)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: Theme.Radius.chip))
            }
        }
    }

    /// The strip keeps one height while it loads and after it loads, so the sheet
    /// never resizes.
    @ViewBuilder
    private var ticketStrip: some View {
        if let window {
            FlightTimeline(
                window: window,
                eventDay: event.start_ms,
                eventHour: event.displayTime,
                markerIcon: event.isRun ? "figure.run" : "sportscourt.fill",
                markerLabel: event.isRun ? "BIEG" : "MECZ",
                selectedOutbound: $planner.outbound,
                selectedReturn: $planner.returning,
                best: bestPair(window)
            )
            .overlay(sideFade)
            .frame(height: Self.stripHeight)
        } else {
            FlightTimelineSkeleton()
                .frame(height: Self.stripHeight)
        }
    }

    private var sideFade: some View {
        LinearGradient(
            stops: [
                .init(color: Theme.Palette.surface, location: 0),
                .init(color: Theme.Palette.surface.opacity(0), location: Self.sideFadeInset),
                .init(color: Theme.Palette.surface.opacity(0), location: Self.sideFadeOutset),
                .init(color: Theme.Palette.surface, location: 1),
            ],
            startPoint: .leading,
            endPoint: .trailing
        )
        .allowsHitTesting(false)
    }

    private var ctaPlaceholder: some View {
        Capsule()
            .fill(Theme.Palette.surfaceRaised)
            .frame(height: CapsuleButton.height)
            .frame(maxWidth: .infinity)
            .skeletonPulse()
    }

    private var reachableDestinations: [Destination] {
        destinations.filter { reachableAirports?.contains($0.iata) ?? true }
    }

    private func bestPair(_ window: FlightWindowResponse) -> FlightPair? {
        FlightScoring.findBestFlight(
            outbound: window.outbound.compactMap { $0.cell },
            returning: window.returning.compactMap { $0.cell },
            eventDate: Date(timeIntervalSince1970: TimeInterval(event.start_ms) / 1000)
        )
    }

    /// The CTA lives outside the card so it is as wide as the hero button.
    private func buyBar(_ destination: Destination) -> some View {
        let outbound = planner.outbound
        let ret = planner.returning
        let hasBoth = outbound != nil && ret != nil
        let hasAny = outbound != nil || ret != nil
        let total = Int((outbound?.price ?? 0) + (ret?.price ?? 0))
        return CapsuleButton(
            title: hasAny ? (hasBoth ? "Kup bilety" : "Kup bilet") : "Wybierz lot aby kupić bilet",
            trailingText: hasAny ? "\(total) zł" : nil,
            fullWidth: true,
            isEnabled: hasAny
        ) {
            if let url = buyURL(destination: destination.iata, outbound: outbound?.date, returning: ret?.date) {
                UIApplication.shared.open(url)
            }
        }
    }

    /// Ryanair deep link. Both legs → round trip (origin→destination). Outbound
    /// only → one-way origin→destination. Return only → one-way destination→origin
    /// (buy just the flight back from this airport).
    private func buyURL(destination: String, outbound: String?, returning: String?) -> URL? {
        let from: String
        let to: String
        let dateOut: String
        let dateIn: String?
        switch (outbound, returning) {
        case let (o?, r?):
            from = origin.iata; to = destination; dateOut = o; dateIn = r
        case let (o?, nil):
            from = origin.iata; to = destination; dateOut = o; dateIn = nil
        case let (nil, r?):
            from = destination; to = origin.iata; dateOut = r; dateIn = nil
        default:
            return nil
        }
        let isReturn = dateIn != nil
        let dateInValue = dateIn ?? ""
        var components = URLComponents(string: "https://www.ryanair.com/pl/pl/trip/flights/select")!
        components.queryItems = [
            URLQueryItem(name: "adults", value: "1"),
            URLQueryItem(name: "teens", value: "0"),
            URLQueryItem(name: "children", value: "0"),
            URLQueryItem(name: "infants", value: "0"),
            URLQueryItem(name: "dateOut", value: dateOut),
            URLQueryItem(name: "dateIn", value: dateInValue),
            URLQueryItem(name: "isConnectedFlight", value: "false"),
            URLQueryItem(name: "discount", value: "0"),
            URLQueryItem(name: "promoCode", value: ""),
            URLQueryItem(name: "isReturn", value: isReturn ? "true" : "false"),
            URLQueryItem(name: "originIata", value: from),
            URLQueryItem(name: "destinationIata", value: to),
            URLQueryItem(name: "tpAdults", value: "1"),
            URLQueryItem(name: "tpTeens", value: "0"),
            URLQueryItem(name: "tpChildren", value: "0"),
            URLQueryItem(name: "tpInfants", value: "0"),
            URLQueryItem(name: "tpStartDate", value: dateOut),
            URLQueryItem(name: "tpEndDate", value: dateInValue),
            URLQueryItem(name: "tpDiscount", value: "0"),
            URLQueryItem(name: "tpPromoCode", value: ""),
            URLQueryItem(name: "tpOriginIata", value: from),
            URLQueryItem(name: "tpDestinationIata", value: to),
        ]
        return components.url
    }

    private func fetchPrices() async {
        guard let destination else { return }
        let day = Date(timeIntervalSince1970: TimeInterval(event.start_ms) / 1000)
        let originIata = origin.iata
        let destIata = destination.iata
        isLoading = true
        defer { isLoading = false }
        let started = Date()
        let fetched = await FlightPricesService.shared.flights(
            airline: airline, origin: originIata, destination: destIata, eventDay: day
        )
        guard !Task.isCancelled else { return }
        await keepSkeletonVisible(since: started)
        apply(fetched)
    }

    private func keepSkeletonVisible(since started: Date) async {
        let elapsed = Date().timeIntervalSince(started)
        guard elapsed < Self.minimumSkeletonDuration else { return }
        let remaining = Self.minimumSkeletonDuration - elapsed
        let nanoseconds = UInt64(remaining * Double(Self.nanosecondsPerSecond))
        try? await Task.sleep(nanoseconds: nanoseconds)
    }

    private func apply(_ fetched: FlightWindowResponse?) {
        guard let fetched else {
            if window == nil { loadFailed = true }
            return
        }
        window = fetched
        guard let best = bestPair(fetched) else {
            planner.clearFlightSelection()
            return
        }
        planner.outbound = fetched.outbound.first { $0.date == Self.dayKey(best.outbound.date) }
        planner.returning = fetched.returning.first { $0.date == Self.dayKey(best.returning.date) }
    }

    private static func dayKey(_ date: Date) -> String {
        AppConstants.isoDayFormatter.string(from: date)
    }
}
