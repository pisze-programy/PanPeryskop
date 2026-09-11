import SwiftUI

private extension Airline {
    var label: String {
        switch self {
        case .ryanair: return "Ryanair"
        case .wizzair: return "Wizzair"
        }
    }
}

/// Soccer flight section: destination-airport rail, the single flight timeline and
/// the "Lecimy" buy bar. Ryanair is the only live provider, so there is no airline
/// pill — the brand shows on the CTA only.
struct SoccerFlightSection: View {
    let event: TravelEvent
    let origin: Airport
    let destinations: [Destination]
    let destination: Destination?
    var reachableAirports: Set<String>? = nil
    let onSelectDestination: (Destination) -> Void
    @ObservedObject var viewModel: TripsViewModel

    @State private var selectedOutbound: FlightWindowCell?
    @State private var selectedReturn: FlightWindowCell?
    @State private var window: FlightWindowResponse?
    @State private var loadFailed = false

    private let airline: Airline = .ryanair
    private var loadKey: String { "\(event.id)|\(destination?.iata ?? "")" }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            if let destination, !reachableDestinations.isEmpty {
                destinationRail(destination)
            }
            if loadFailed {
                ErrorState(message: "Nie udało się pobrać lotów") {
                    loadFailed = false
                    loadPrices()
                }
            } else if let destination, let window {
                SoccerFlightTimeline(
                    window: window,
                    eventDay: event.start_ms,
                    selectedOutbound: $selectedOutbound,
                    selectedReturn: $selectedReturn,
                    best: bestPair(window)
                )
                buyBar(destination)
            } else if destination != nil {
                LoadingOverlay()
            }
        }
        .padding(Theme.Spacing.l)
        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
        .padding(.horizontal, Theme.Spacing.l)
        .onAppear { reset() }
        .onChange(of: loadKey) { _, _ in reset() }
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
                        .background(Capsule().fill(active.iata == dest.iata ? airline.color : Theme.Palette.surfaceRaised))
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
        if let outbound = selectedOutbound, let ret = selectedReturn {
            CapsuleButton(
                title: "\(airline.label) ✈ Lecimy",
                trailingText: "\(Int(outbound.price ?? 0) + Int(ret.price ?? 0)) zł",
                tint: airline.color
            ) {
                if let url = buyURL(destination: destination.iata, outbound: outbound.date, returning: ret.date) {
                    UIApplication.shared.open(url)
                }
            }
        }
    }

    private func buyURL(destination: String, outbound: String, returning: String) -> URL? {
        var components = URLComponents(string: "https://www.ryanair.com/pl/pl/trip/flights/select")!
        components.queryItems = [
            URLQueryItem(name: "adults", value: "1"),
            URLQueryItem(name: "teens", value: "0"),
            URLQueryItem(name: "children", value: "0"),
            URLQueryItem(name: "infants", value: "0"),
            URLQueryItem(name: "dateOut", value: outbound),
            URLQueryItem(name: "dateIn", value: returning),
            URLQueryItem(name: "isConnectedFlight", value: "false"),
            URLQueryItem(name: "discount", value: "0"),
            URLQueryItem(name: "promoCode", value: ""),
            URLQueryItem(name: "isReturn", value: "false"),
            URLQueryItem(name: "originIata", value: origin.iata),
            URLQueryItem(name: "destinationIata", value: destination),
        ]
        return components.url
    }

    private func reset() {
        selectedOutbound = nil
        selectedReturn = nil
        window = nil
        loadFailed = false
        loadPrices()
    }

    private func loadPrices() {
        guard let destination else { return }
        let day = Date(timeIntervalSince1970: TimeInterval(event.start_ms) / 1000)
        let originIata = origin.iata
        let destIata = destination.iata
        Task {
            if let w = await FlightPricesService.shared.flights(airline: airline, origin: originIata, destination: destIata, eventDay: day) {
                window = w
                // Recommend the best pair up front — no tap needed.
                if let best = bestPair(w) {
                    selectedOutbound = w.outbound.first { $0.date == Self.dayKey(best.outbound.date) }
                    selectedReturn = w.returning.first { $0.date == Self.dayKey(best.returning.date) }
                }
            } else {
                loadFailed = true
            }
        }
    }

    private static func dayKey(_ date: Date) -> String {
        AppConstants.isoDayFormatter.string(from: date)
    }
}