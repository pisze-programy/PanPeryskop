import SwiftUI

struct LuggageContext: Equatable {
    let city: String?
    let iata: String?
    let preferAirport: Bool
    let from: String?
    let to: String?
}

struct LuggageBanner: View {
    let context: LuggageContext

    @State private var url: URL?
    @State private var price: Double?

    private static let title = "Zostaw bagaż na mieście"
    private static let stops = [
        Gradient.Stop(color: Color(hex: 0xFFFFFF), location: 0),
        Gradient.Stop(color: Color(hex: 0xFFFFFF), location: 0.5),
        Gradient.Stop(color: Color(hex: 0xFFF0DC), location: 0.72),
        Gradient.Stop(color: Color(hex: 0xFFD9A8), location: 1),
    ]

    private static let ink = Color(hex: 0x141414)
    private static let chevron = Color(hex: 0xE08A2E)

    private var subtitle: String {
        guard let price else { return "Przechowalnie w centrum — rezerwacja online" }
        return "Od \(Int(price.rounded())) zł/dzień — rezerwacja online"
    }

    var body: some View {
        Button(action: open) {
            HStack(spacing: Theme.Spacing.m) {
                PartnerLogo(name: "radicalstorage")
                VStack(alignment: .leading, spacing: 2) {
                    Text(Self.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Self.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundColor(Self.ink.opacity(0.8))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Self.chevron)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .partnerCardBackground(stops: Self.stops)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(Self.title) \(subtitle)")
        .task(id: context) { await load() }
    }

    private var place: String {
        context.city ?? context.iata ?? "unknown"
    }

    private func load() async {
        guard let response = try? await APIClient.getLuggageLink(
            city: context.city,
            iata: context.iata,
            preferAirport: context.preferAirport,
            from: context.from,
            to: context.to
        ) else { return }
        url = URL(string: response.url)
        price = response.price
    }

    private func open() {
        guard let url else { return }
        MetaSignals.checkout(kind: .luggage, id: place, name: Self.title)
        ProductAnalytics.bookingTapped(kind: .luggage, id: place)
        Haptics.selection()
        UIApplication.shared.open(url)
    }
}
