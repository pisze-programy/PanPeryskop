import SwiftUI

private extension Airline {
    var label: String {
        switch self {
        case .ryanair: return "Ryanair"
        case .wizzair: return "Wizzair"
        }
    }
}

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
    @State private var visible = false

    private let airline: Airline = .ryanair
    private var loadKey: String { "\(event.id)|\(destination?.iata ?? "")" }
    private var shouldLoad: Bool { isActive && visible }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            TripsSectionHeader(
                title: "Wybierz lotnisko docelowe",
                info: "Tip: możesz kupić lot w jedną stronę i wrócić z innego lotniska."
            )
            card
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.section)
        .onScrollVisibilityChange(threshold: 0.1) { visible = $0 }
        .onAppear { if shouldLoad { fetchPrices() } }
        .onChange(of: shouldLoad) { _, ready in if ready { fetchPrices() } }
        .onChange(of: loadKey) { _, _ in if shouldLoad { fetchPrices() } }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            if let destination, !reachableDestinations.isEmpty {
                destinationRail(destination)
            }
            if loadFailed, window == nil {
                ErrorState(message: "Nie udało się pobrać lotów") {
                    loadFailed = false
                    fetchPrices()
                }
            } else if let destination, let window {
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
                buyBar(destination)
            } else if destination != nil {
                FlightTimelineSkeleton()
                ctaPlaceholder
            }
        }
        .padding(Theme.Spacing.l)
        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
        .overlay {
            if isLoading, window != nil {
                ProgressView()
                    .padding(Theme.Spacing.s)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: Theme.Radius.chip))
            }
        }
    }

    private var ctaPlaceholder: some View {
        RoundedRectangle(cornerRadius: 22)
            .fill(Theme.Palette.surfaceRaised)
            .frame(height: 44)
            .frame(maxWidth: .infinity)
            .skeletonPulse()
    }

    private var reachableDestinations: [Destination] {
        destinations.filter { reachableAirports?.contains($0.iata) ?? true }
    }

    private func destinationRail(_ active: Destination) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.Spacing.s) {
                ForEach(reachableDestinations, id: \.iata) { dest in
                    Button {
                        onSelectDestination(dest)
                    } label: {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("\(origin.iata) → \(dest.iata)")
                                .font(.caption.weight(.bold))
                            Text(dest.city)
                                .font(.caption2)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, Theme.Spacing.m)
                        .padding(.vertical, Theme.Spacing.s)
                        .background(Capsule().fill(active.iata == dest.iata ? Color.accentColor : Theme.Palette.surfaceRaised))
                        .foregroundColor(active.iata == dest.iata ? .white : .primary)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func bestPair(_ window: FlightWindowResponse) -> FlightPair? {
        FlightScoring.findBestFlight(
            outbound: window.outbound.compactMap { $0.cell },
            returning: window.returning.compactMap { $0.cell },
            eventDate: Date(timeIntervalSince1970: TimeInterval(event.start_ms) / 1000)
        )
    }

    @ViewBuilder
    private func buyBar(_ destination: Destination) -> some View {
        if let outbound = planner.outbound {
            let ret = planner.returning
            let total = Int((outbound.price ?? 0) + (ret?.price ?? 0))
            CapsuleButton(
                title: "\(airline.label) ✈ Lecimy",
                trailingText: "\(total) zł",
                fullWidth: true
            ) {
                if let url = buyURL(destination: destination.iata, outbound: outbound.date, returning: ret?.date) {
                    UIApplication.shared.open(url)
                }
            }
        }
    }

    /// Ryanair deep link. Two days selected → round trip (isReturn=true, dateIn
    /// set); one day (outbound only) → one-way (isReturn=false, dateIn/tpEndDate
    /// empty). Mirrors the booking form's own query keys, incl. the tp* mirror.
    private func buyURL(destination: String, outbound: String, returning: String?) -> URL? {
        var components = URLComponents(string: "https://www.ryanair.com/pl/pl/trip/flights/select")!
        let isReturn = returning != nil
        let dateIn = returning ?? ""
        components.queryItems = [
            URLQueryItem(name: "adults", value: "1"),
            URLQueryItem(name: "teens", value: "0"),
            URLQueryItem(name: "children", value: "0"),
            URLQueryItem(name: "infants", value: "0"),
            URLQueryItem(name: "dateOut", value: outbound),
            URLQueryItem(name: "dateIn", value: dateIn),
            URLQueryItem(name: "isConnectedFlight", value: "false"),
            URLQueryItem(name: "discount", value: "0"),
            URLQueryItem(name: "promoCode", value: ""),
            URLQueryItem(name: "isReturn", value: isReturn ? "true" : "false"),
            URLQueryItem(name: "originIata", value: origin.iata),
            URLQueryItem(name: "destinationIata", value: destination),
            URLQueryItem(name: "tpAdults", value: "1"),
            URLQueryItem(name: "tpTeens", value: "0"),
            URLQueryItem(name: "tpChildren", value: "0"),
            URLQueryItem(name: "tpInfants", value: "0"),
            URLQueryItem(name: "tpStartDate", value: outbound),
            URLQueryItem(name: "tpEndDate", value: dateIn),
            URLQueryItem(name: "tpDiscount", value: "0"),
            URLQueryItem(name: "tpPromoCode", value: ""),
            URLQueryItem(name: "tpOriginIata", value: origin.iata),
            URLQueryItem(name: "tpDestinationIata", value: destination),
        ]
        return components.url
    }

    private func fetchPrices() {
        guard let destination else { return }
        let day = Date(timeIntervalSince1970: TimeInterval(event.start_ms) / 1000)
        let originIata = origin.iata
        let destIata = destination.iata
        isLoading = true
        let started = Date()
        Task {
            let fetched = await FlightPricesService.shared.flights(
                airline: airline, origin: originIata, destination: destIata, eventDay: day
            )
            let elapsed = Date().timeIntervalSince(started)
            if elapsed < 0.15 {
                try? await Task.sleep(nanoseconds: UInt64((0.15 - elapsed) * 1_000_000_000))
            }
            if let fetched {
                window = fetched
                if let best = bestPair(fetched) {
                    planner.outbound = fetched.outbound.first { $0.date == Self.dayKey(best.outbound.date) }
                    planner.returning = fetched.returning.first { $0.date == Self.dayKey(best.returning.date) }
                } else {
                    planner.clearFlightSelection()
                }
            } else if window == nil {
                loadFailed = true
            }
            isLoading = false
        }
    }

    private static func dayKey(_ date: Date) -> String {
        AppConstants.isoDayFormatter.string(from: date)
    }
}