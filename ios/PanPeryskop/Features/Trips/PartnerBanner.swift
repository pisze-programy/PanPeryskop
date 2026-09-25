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
                .init(color: Color(hex: 0xFFFFFF), location: 0.6),
                .init(color: Color(hex: 0x1C1C1F), location: 1),
            ],
            foreground: Color(hex: 0x0A0A0A),
            chevron: .white,
            icon: "revolut"
        ),
        PartnerBanner(
            id: "airhelp",
            title: "Opóźniony lub odwołany lot?",
            subtitle: "Uzyskaj nawet 600 € odszkodowania!",
            url: URL(string: "https://api.panperyskop.app/r/airhelp")!,
            stops: [
                .init(color: Color(hex: 0xF3F5FF), location: 0),
                .init(color: Color(hex: 0xF3F5FF), location: 0.5),
                .init(color: Color(hex: 0x6E7BD6), location: 0.82),
                .init(color: Color(hex: 0xB3516E), location: 1),
            ],
            foreground: Color(hex: 0x0F1330),
            chevron: .white,
            icon: "airhelp"
        ),
        PartnerBanner(
            id: "airalo",
            title: "Karta eSIM — bez limitu w Europie!",
            subtitle: "Poczuj wolność na wyjeździe, od 16 zł",
            url: URL(string: "https://api.panperyskop.app/r/airalo")!,
            stops: [
                .init(color: Color(hex: 0xF2EBE3), location: 0),
                .init(color: Color(hex: 0xF6C283), location: 0.5),
                .init(color: Color(hex: 0xF08E48), location: 1),
            ],
            foreground: Color(hex: 0x101012),
            icon: "airalo"
        ),
    ]
}
