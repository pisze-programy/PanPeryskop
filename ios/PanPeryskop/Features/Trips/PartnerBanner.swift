import SwiftUI

/// A partner banner under the attractions section. The whole card is one tap
/// target that opens the partner's landing page in the in-app browser.
struct PartnerBanner: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let cta: String
    let url: URL
    let gradient: [Color]
    let foreground: Color
    let buttonBackground: Color
    let buttonForeground: Color
}

extension PartnerBanner {
    /// Colours sampled from the partners' own landing pages.
    static let travel: [PartnerBanner] = [
        PartnerBanner(
            id: "airhelp",
            title: "Opóźniony lub odwołany lot?",
            subtitle: "Uzyskaj nawet 600 € odszkodowania!",
            cta: "Dowiedz się, ile może Ci się należeć",
            url: URL(string: "https://airhelp.tpo.mx/XAt50GXJ")!,
            gradient: [
                Color(hex: 0x2d5fd6),
                Color(hex: 0x3a53b8),
                Color(hex: 0xb3516e),
            ],
            foreground: .white,
            buttonBackground: Color(hex: 0x5384f2),
            buttonForeground: .white
        ),
        PartnerBanner(
            id: "airalo",
            title: "Poczuj wolność dzięki nieograniczonej transmisji danych",
            subtitle: "Karta eSIM od 16 zł",
            cta: "Informacje o pakietach bez ograniczeń",
            url: URL(string: "https://airalo.tpo.mx/O378fS2W")!,
            gradient: [Color(hex: 0xf2ebe3), Color(hex: 0xf0e8e0)],
            foreground: Color(hex: 0x101012),
            buttonBackground: Color(hex: 0xf08e48),
            buttonForeground: Color(hex: 0x101012)
        ),
    ]
}
