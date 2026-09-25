import SwiftUI

struct CarRentalContext: Equatable {
    let iata: String
    let from: String?
    let to: String?
}

struct CarRentalBanner: View {
    let context: CarRentalContext

    @State private var url: URL?

    private static let title = "Wynajmij auto przy lotnisku"
    private static let subtitle = "Od 49 zł/dzień — bezpłatne odwołanie"
    private static let stops = [
        Gradient.Stop(color: Color(hex: 0xFFFFFF), location: 0),
        Gradient.Stop(color: Color(hex: 0xFFFFFF), location: 0.5),
        Gradient.Stop(color: Color(hex: 0xDCE9FF), location: 0.72),
        Gradient.Stop(color: Color(hex: 0xA8C6FF), location: 1),
    ]

    private static let ink = Color(hex: 0x141414)
    private static let chevron = Color(hex: 0x3570E6)

    var body: some View {
        Button(action: open) {
            HStack(spacing: Theme.Spacing.m) {
                PartnerLogo(name: "qeeq")
                VStack(alignment: .leading, spacing: 2) {
                    Text(Self.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Self.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(Self.subtitle)
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
        .accessibilityLabel("\(Self.title) \(Self.subtitle)")
        .task(id: context) { await load() }
    }

    private func load() async {
        url = try? await APIClient.getCarLink(iata: context.iata, from: context.from, to: context.to)
    }

    private func open() {
        guard let url else { return }
        Haptics.selection()
        UIApplication.shared.open(url)
    }
}
