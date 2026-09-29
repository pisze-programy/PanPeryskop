import SwiftUI

struct CarRentalContext: Equatable {
    let iata: String
    let from: String?
    let to: String?
}

struct CarRentalBanner: View {
    let context: CarRentalContext

    @State private var url: URL?
    @State private var price: Double?

    private static let title = "Wynajmij auto przy lotnisku"
    private static let stops = [
        Gradient.Stop(color: Color(hex: 0xFFFFFF), location: 0),
        Gradient.Stop(color: Color(hex: 0xFFFFFF), location: 0.5),
        Gradient.Stop(color: Color(hex: 0xDCE9FF), location: 0.72),
        Gradient.Stop(color: Color(hex: 0xA8C6FF), location: 1),
    ]

    private static let ink = Color(hex: 0x141414)
    private static let chevron = Color(hex: 0x3570E6)

    private var subtitle: String {
        guard let price else { return "Od 49 zł/dzień — bezpłatne odwołanie" }
        return "Od \(Int(price.rounded())) zł/dzień — bezpłatne odwołanie"
    }

    var body: some View {
        Button(action: open) {
            HStack(spacing: Theme.Spacing.m) {
                PartnerLogo(name: "qeeq")
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

    private func load() async {
        guard let response = try? await APIClient.getCarLink(iata: context.iata, from: context.from, to: context.to) else { return }
        url = URL(string: response.url)
        price = response.price
    }

    private func open() {
        guard let url else { return }
        MetaSignals.checkout(kind: .car, id: context.iata, name: Self.title)
        ProductAnalytics.bookingTapped(kind: .car, id: context.iata)
        Haptics.selection()
        UIApplication.shared.open(url)
    }
}
