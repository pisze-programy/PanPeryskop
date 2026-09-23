import SwiftUI

/// One direction of the bus search: route header, day tabs and the offers.
/// Used twice — outbound (origin → event city) and return (event city → origin).
struct BusDirectionSection: View {
    let fromCity: String
    let toCity: String
    let days: [Date]
    let eventDay: Date
    let eventIcon: String
    let scrollAnchor: UnitPoint
    /// Days from the event day the strip opens on. An outbound leaves before the
    /// event and a return follows it, so neither opens on the event day.
    let defaultOffset: Int
    let isActive: Bool

    @State private var selectedDay: Date?
    @State private var window: BusWindowResponse?
    @State private var failed = false

    private var selected: Date { selectedDay ?? defaultDay }

    private var defaultDay: Date {
        AppConstants.warsawCalendar.date(byAdding: .day, value: defaultOffset, to: eventDay) ?? eventDay
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            routeHeader
            BusDayStrip(
                days: days,
                selected: selected,
                eventDay: eventDay,
                eventIcon: eventIcon,
                scrollAnchor: scrollAnchor
            ) { day in
                selectedDay = day
            }
            content
        }
        .task(id: trigger) {
            guard isActive else { return }
            await load()
        }
    }

    private var trigger: String {
        "\(fromCity)|\(toCity)|\(AppConstants.isoDayFormatter.string(from: selected))|\(isActive)"
    }

    private var routeHeader: some View {
        HStack(spacing: Theme.Spacing.s) {
            Image(systemName: "bus.fill")
                .foregroundColor(Theme.Palette.partnerGreen)
            Text("\(fromCity) → \(toCity)")
                .font(.headline)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.l)
    }

    @ViewBuilder
    private var content: some View {
        if failed {
            ErrorState(message: "Nie udało się pobrać połączeń") {
                Task { await load() }
            }
            .padding(.horizontal, Theme.Spacing.l)
        } else if let window {
            if window.offers.isEmpty {
                BusEmptyState(from: fromCity, to: toCity)
                    .padding(.horizontal, Theme.Spacing.l)
            } else {
                card(window)
            }
        } else {
            BusSkeleton()
                .padding(.horizontal, Theme.Spacing.l)
        }
    }

    private func card(_ window: BusWindowResponse) -> some View {
        let offers = Array(window.offers.sorted { $0.hour < $1.hour }.prefix(3))
        let fastest = window.offers.min { $0.durationMinutes < $1.durationMinutes }
        let cheapest = window.offers.min { $0.price < $1.price }
        return Button {
            Haptics.selection()
            openBusBooking(window.bookUrl)
        } label: {
            VStack(spacing: Theme.Spacing.s) {
                ForEach(offers) { offer in
                    busRow(offer, isFastest: offer.id == fastest?.id, isCheapest: offer.id == cheapest?.id)
                }
            }
            .padding(Theme.Spacing.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, Theme.Spacing.l)
    }

    private func busRow(_ offer: BusOffer, isFastest: Bool, isCheapest: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
            Text(offer.hour)
                .font(.subheadline.weight(.semibold))
                .frame(width: 46, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(offer.transfers > 0 ? "\(offer.transfers) przesiadka" : "bez przesiadek")
                    .font(.caption)
                    .foregroundColor(.secondary)
                badge(offer, isFastest: isFastest, isCheapest: isCheapest)
            }
            Spacer(minLength: 0)
            Text("\(offer.price) zł")
                .font(.headline)
                .foregroundColor(isCheapest ? Theme.Palette.partnerGreen : .primary)
        }
    }

    @ViewBuilder
    private func badge(_ offer: BusOffer, isFastest: Bool, isCheapest: Bool) -> some View {
        let time = Self.durationLabel(offer.durationMinutes)
        if isFastest {
            Text("Najszybszy, \(time)")
                .font(.caption.weight(.semibold))
                .foregroundColor(Theme.Palette.partnerGreen)
        } else if isCheapest {
            Text("Najtańszy, \(time)")
                .font(.caption)
                .foregroundColor(.secondary)
        } else {
            Text(time)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    private func openBusBooking(_ raw: String?) {
        guard let raw, let url = URL(string: raw) else { return }
        UIApplication.shared.open(url)
    }

    private func load() async {
        failed = false
        window = nil
        do {
            let result = try await BusPricesService.shared.bus(fromCity: fromCity, toCity: toCity, eventDay: selected)
            guard !Task.isCancelled else { return }
            window = result
        } catch {
            guard !Task.isCancelled else { return }
            failed = true
        }
    }

    private static func durationLabel(_ minutes: Int) -> String {
        let h = minutes / 60
        let m = minutes % 60
        return m == 0 ? "\(h) h" : "\(h) h \(m) min"
    }
}
