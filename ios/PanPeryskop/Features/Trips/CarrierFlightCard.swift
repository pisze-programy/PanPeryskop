import SwiftUI

struct CarrierFlightCard: View {
    let carrier: Airline
    let event: TravelEvent
    let originIata: String
    let destinationIata: String
    let window: FlightWindowResponse?
    let isFailed: Bool
    @Binding var selectedOutbound: FlightWindowCell?
    @Binding var selectedReturn: FlightWindowCell?
    let onRetry: () -> Void

    private static let stripHeight = FlightTimeline.cellHeight + 2 * Theme.Spacing.xs
    private static let sideFadeInset: CGFloat = 0.06
    private static let sideFadeOutset: CGFloat = 0.94

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            board
            buyBar
        }
        .padding(.vertical, Theme.Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Palette.surface)
    }

    @ViewBuilder
    private var board: some View {
        if isFailed, window == nil {
            ErrorState(message: "Nie udało się pobrać lotów") {
                onRetry()
            }
            .padding(.horizontal, Theme.Spacing.l)
        } else if let window {
            FlightTimeline(
                window: window,
                eventDay: event.start_ms,
                eventHour: event.displayTime,
                markerIcon: event.isRun ? "figure.run" : "sportscourt.fill",
                markerLabel: event.isRun ? "BIEG" : "MECZ",
                selectedOutbound: $selectedOutbound,
                selectedReturn: $selectedReturn,
                best: bestPair(window)
            )
            .overlay(sideFade)
            .frame(height: Self.stripHeight)
        } else {
            FlightTimelineSkeleton()
                .frame(height: Self.stripHeight)
        }
    }

    @ViewBuilder
    private var buyBar: some View {
        if let window {
            let hasAny = selectedOutbound != nil || selectedReturn != nil
            let total = Int((selectedOutbound?.price ?? 0) + (selectedReturn?.price ?? 0))
            let hasBookable = window.outbound.contains { $0.price != nil } || window.returning.contains { $0.price != nil }
            CapsuleButton(
                title: hasAny ? "Kup w \(carrier.displayName)" : (hasBookable ? "Wybierz lot aby kupić bilet" : "Bilety wyprzedane"),
                trailingText: hasAny ? "\(total) zł" : nil,
                tint: carrier.color,
                fullWidth: true,
                isEnabled: hasAny
            ) {
                openBooking(window: window)
            }
            .padding(.horizontal, Theme.Spacing.l)
        } else if !isFailed {
            CapsuleButton(
                title: "Wybierz lot aby kupić bilet",
                trailingText: nil,
                tint: carrier.color,
                fullWidth: true,
                isEnabled: false
            ) {}
            .padding(.horizontal, Theme.Spacing.l)
        }
    }

    private func openBooking(window: FlightWindowResponse) {
        let outbound = selectedOutbound?.date
        let returning = selectedReturn?.date
        guard let url = carrier.bookingURL(
            origin: originIata,
            destination: destinationIata,
            outbound: outbound,
            returning: returning
        ) else { return }
        UIApplication.shared.open(url)
    }

    private func bestPair(_ window: FlightWindowResponse) -> FlightPair? {
        FlightScoring.findBestFlight(
            outbound: window.outbound.compactMap { $0.cell },
            returning: window.returning.compactMap { $0.cell },
            eventDate: Date(timeIntervalSince1970: TimeInterval(event.start_ms) / 1000)
        )
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
}
