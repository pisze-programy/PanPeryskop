import Foundation
import SwiftUI

/// A market the app serves: region, country, language, currency and the display
/// rate. The user picks one in onboarding and can change it in the profile, so
/// no screen may hardcode PLN, Polish or a rate outside this type.
struct Region: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let name: String
    let country: String
    let language: String
    let languageCode: String
    let currency: String
    let currencySymbol: String
    /// USD → the local currency. A snapshot until a live rate is fetched.
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
    /// A USD amount in the local currency, grouped and rounded.
    func price(_ usd: Double) -> String {
        let value = Int((usd * usdToLocal).rounded())
        return "\(value.formatted(.number.grouping(.automatic))) \(currencySymbol)"
    }

    /// A 0–5 score in words. The bare number means nothing to a traveller.
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
