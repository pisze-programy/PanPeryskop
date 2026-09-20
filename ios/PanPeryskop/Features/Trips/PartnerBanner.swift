import SwiftUI

/// A partner banner under the attractions section. The whole card is one tap
/// target that opens the partner's landing page in the in-app browser.
struct PartnerBanner: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let url: URL
    /// Left-to-right gradient, so the chevron on the right shows its end colour.
    let gradient: [Color]
    let foreground: Color
}

extension PartnerBanner {
    /// Colours sampled from the partners' own landing pages.
    static let travel: [PartnerBanner] = [
        PartnerBanner(
            id: "airhelp",
            title: "Opóźniony lub odwołany lot?",
            subtitle: "Uzyskaj nawet 600 € odszkodowania!",
            url: URL(string: "https://airhelp.tpo.mx/XAt50GXJ")!,
            gradient: [
                Color(hex: 0x2d5fd6),
                Color(hex: 0x5a4fb4),
                Color(hex: 0xb3516e),
            ],
            foreground: .white
        ),
        PartnerBanner(
            id: "airalo",
            title: "Karta eSIM — bez limitu w Europie!",
            subtitle: "Poczuj wolność na wyjeździe, od 16 zł",
            url: URL(string: "https://airalo.tpo.mx/O378fS2W")!,
            gradient: [
                Color(hex: 0xf2ebe3),
                Color(hex: 0xf6c283),
                Color(hex: 0xf08e48),
            ],
            foreground: Color(hex: 0x101012)
        ),
    ]
}
