import Foundation
import SwiftUI
struct Region: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let name: String
    let country: String
    let language: String
    let languageCode: String
    let currency: String
    let currencySymbol: String
    let usdToLocal: Double

    var locale: Locale { Locale(identifier: languageCode) }
}

extension Region {
    static let europePoland = Region(
        id: "eu-pl",
        name: "Europa",
        country: "Polska",
        language: "Polski",
        languageCode: "pl_PL",
        currency: "PLN",
        currencySymbol: "zł",
        usdToLocal: 3.65
    )

    static let northAmericaUsa = Region(
        id: "na-us",
        name: "Ameryka Północna",
        country: "USA",
        language: "Angielski",
        languageCode: "en_US",
        currency: "USD",
        currencySymbol: "$",
        usdToLocal: 1
    )

    static let all: [Region] = [.europePoland, .northAmericaUsa]
    static let fallback = Region.europePoland
}

extension Region {
    func price(_ usd: Double) -> String {
        let value = Int((usd * usdToLocal).rounded())
        return "\(value.formatted(.number.grouping(.automatic))) \(currencySymbol)"
    }
    func scoreLabel(_ value: Double?) -> String {
        guard let value else { return "brak danych" }
        switch value {
        case ..<2: return "Słabo"
        case ..<3: return "Przeciętnie"
        case ..<3.8: return "Dobrze"
        case ..<4.5: return "Bardzo dobrze"
        default: return "Świetnie"
        }
    }
}

private struct RegionKey: EnvironmentKey {
    static let defaultValue = Region.fallback
}

extension EnvironmentValues {
    var region: Region {
        get { self[RegionKey.self] }
        set { self[RegionKey.self] = newValue }
    }
}
