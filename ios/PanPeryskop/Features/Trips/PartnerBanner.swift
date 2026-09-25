import SwiftUI

struct PartnerBanner: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let url: URL
    let stops: [Gradient.Stop]
    let foreground: Color
    let chevron: Color
    let icon: String?

    init(
        id: String,
        title: String,
        subtitle: String,
        url: URL,
        stops: [Gradient.Stop],
        foreground: Color,
        chevron: Color? = nil,
        icon: String? = nil
    ) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.url = url
        self.stops = stops
        self.foreground = foreground
        self.chevron = chevron ?? foreground
        self.icon = icon
    }
}

extension PartnerBanner {
    static let travel: [PartnerBanner] = [
        PartnerBanner(
            id: "revolut",
            title: "Darmowa karta walutowa",
            subtitle: "Revolut — Kurs przed płatnością, bez opłat!",
            url: URL(string: "https://api.panperyskop.app/r/revolut")!,
            stops: [
                .init(color: Color(hex: 0xFFFFFF), location: 0),
                .init(color: Color(hex: 0xFFFFFF), location: 0.5),
                .init(color: Color(hex: 0xE4E7FF), location: 0.72),
                .init(color: Color(hex: 0xB7BDFB), location: 1),
            ],
            foreground: Color(hex: 0x141414),
            chevron: Color(hex: 0x4F55F1),
            icon: "revolut"
        ),
        PartnerBanner(
            id: "airhelp",
            title: "Opóźniony lub odwołany lot?",
            subtitle: "Uzyskaj nawet 600 € odszkodowania!",
            url: URL(string: "https://api.panperyskop.app/r/airhelp")!,
            stops: [
                .init(color: Color(hex: 0xFFFFFF), location: 0),
                .init(color: Color(hex: 0xFFFFFF), location: 0.5),
                .init(color: Color(hex: 0xF2DCE3), location: 0.72),
                .init(color: Color(hex: 0xDDA9BA), location: 1),
            ],
            foreground: Color(hex: 0x141414),
            chevron: Color(hex: 0xB3516E),
            icon: "airhelp"
        ),
        PartnerBanner(
            id: "saily",
            title: "Karta eSIM — bez limitu w Europie!",
            subtitle: "Poczuj wolność na wyjeździe, od 16 zł",
            url: URL(string: "https://api.panperyskop.app/r/saily")!,
            stops: [
                .init(color: Color(hex: 0xFFFFFF), location: 0),
                .init(color: Color(hex: 0xFFFFFF), location: 0.5),
                .init(color: Color(hex: 0xFFF7A8), location: 0.72),
                .init(color: Color(hex: 0xFFF500), location: 1),
            ],
            foreground: Color(hex: 0x141414),
            chevron: Color(hex: 0xC7B000),
            icon: "saily"
        ),
    ]
}
