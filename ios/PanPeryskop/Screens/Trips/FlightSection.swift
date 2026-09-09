import SwiftUI

/// Flight section — TransportSlider pattern: destination-airport rail (== map arcs),
/// airline pills scoped to the destination's providers, then the two-row day grid + buy bar.
struct FlightSection: View {
    let event: TravelEvent
    let origin: Airport
    let destinations: [Destination]
    let destination: Destination?
    let onSelectDestination: (Destination) -> Void
    @ObservedObject var viewModel: TripsViewModel

    @State private var selectedAirline: Airline = .ryanair
    @State private var selectedOutbound: FlightWindowCell?
    @State private var selectedReturn: FlightWindowCell?
    @State private var windows: [Airline: FlightWindowResponse] = [:]
    @State private var loadFailed = false

    private var airlines: [Airline] { destination?.providers ?? [] }
    private var loadKey: String { "\(event.id)|\(destination?.iata ?? "")" }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let destination {
                destinationRail(destination)
                if !airlines.isEmpty {
                    airlineRail
                }
            }
            if loadFailed {
                errorState
            } else if let destination, let window = windows[selectedAirline] {
                FlightGrid(
                    window: window,
                    eventDay: event.start_ms,
                    originName: origin.city,
                    destinationName: destination.city,
                    selectedOutbound: $selectedOutbound,
                    selectedReturn: $selectedReturn,
                    best: bestPair(window)
                )
                buyBar(destination)
            } else if destination != nil {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .padding(.vertical, 16)
            }
        }
        .padding(16)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 16)
        .onAppear { reset() }
        .onChange(of: loadKey) { _, _ in reset() }
    }

    private var errorState: some View {
        VStack(spacing: 8) {
            Text("Nie udało się pobrać lotów")
                .font(.caption)
                .foregroundColor(.secondary)
            Button("Spróbuj ponownie") {
                loadFailed = false
                loadPrices()
            }
            .font(.caption.weight(.semibold))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
    }

    private func destinationRail(_ active: Destination) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(destinations, id: \.iata) { dest in
                    Button {
                        onSelectDestination(dest)
                    } label: {
                        HStack(spacing: 6) {
                            Text(dest.iata)
                                .font(.caption.weight(.bold))
                            Text(dest.city)
                                .font(.caption)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(active.iata == dest.iata ? chipColor(dest) : Color(.systemGray5)))
                        .foregroundColor(active.iata == dest.iata ? .white : .primary)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func chipColor(_ dest: Destination) -> Color {
        dest.providers.contains(.wizzair) ? Airline.wizzair.color : Airline.ryanair.color
    }

    private var airlineRail: some View {
        HStack(spacing: 8) {
            ForEach(airlines, id: \.self) { airline in
                Button {
                    selectedAirline = airline
                    selectedOutbound = nil
                    selectedReturn = nil
                } label: {
                    Text(airline.label)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(selectedAirline == airline ? airline.color : Color(.systemGray5)))
                        .foregroundColor(selectedAirline == airline ? .white : .primary)
                }
                .buttonStyle(.plain)
            }
            Spacer()
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
            Button {
                if let url = buyURL(destination: destination.iata, outbound: outbound.date, returning: ret.date) {
                    UIApplication.shared.open(url)
                }
            } label: {
                HStack {
                    Text("Lecimy ✈")
                    Spacer()
                    Text("\(Int(outbound.price ?? 0) + Int(ret.price ?? 0)) zł")
                }
                .font(.subheadline.weight(.bold))
                .foregroundColor(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Capsule().fill(selectedAirline.color))
            }
            .buttonStyle(.plain)
        }
    }

    private func buyURL(destination: String, outbound: String, returning: String) -> URL? {
        switch selectedAirline {
        case .ryanair:
            return URL(string: "https://www.ryanair.com/pl/pl/trip/flights/select?originIata=\(origin.iata)&destinationIata=\(destination)&dateOut=\(outbound)&dateIn=\(returning)")
        case .wizzair:
            return URL(string: "https://www.wizzair.com/en-gb/booking/select-flight/\(origin.iata)/\(destination)/\(outbound)/\(returning)/1/0/0/null")
        }
    }

    private func reset() {
        selectedAirline = airlines.first ?? .ryanair
        selectedOutbound = nil
        selectedReturn = nil
        windows = [:]
        loadFailed = false
        loadPrices()
    }

    private func loadPrices() {
        guard let destination, !airlines.isEmpty else { return }
        let day = Date(timeIntervalSince1970: TimeInterval(event.start_ms) / 1000)
        let originIata = origin.iata
        let destIata = destination.iata
        Task {
            var result: [Airline: FlightWindowResponse] = [:]
            for airline in airlines {
                if let w = await FlightPricesService.shared.flights(airline: airline, origin: originIata, destination: destIata, eventDay: day) {
                    result[airline] = w
                }
            }
            if result[selectedAirline] == nil {
                loadFailed = true
            } else {
                windows = result
            }
        }
    }
}