import Foundation

enum CountryNames {
    static func name(_ code: String, language: String) -> String? {
        Locale(identifier: language).localizedString(forRegionCode: code.uppercased())
    }

    private static let byEnglishName: [String: String] = [
        "albania": "AL", "andorra": "AD", "austria": "AT", "belarus": "BY",
        "belgium": "BE", "bosnia": "BA", "bosnia and herzegovina": "BA",
        "bulgaria": "BG", "croatia": "HR", "cyprus": "CY", "czech republic": "CZ",
        "czechia": "CZ", "denmark": "DK", "england": "GB", "estonia": "EE",
        "finland": "FI", "france": "FR", "georgia": "GE", "germany": "DE",
        "greece": "GR", "holy see": "VA", "hungary": "HU", "iceland": "IS",
        "ireland": "IE", "italy": "IT", "kosovo": "XK", "latvia": "LV",
        "liechtenstein": "LI", "lithuania": "LT", "luxembourg": "LU", "malta": "MT",
        "moldova": "MD", "monaco": "MC", "montenegro": "ME", "netherlands": "NL",
        "north macedonia": "MK", "macedonia": "MK", "northern ireland": "GB",
        "norway": "NO", "poland": "PL", "portugal": "PT", "romania": "RO",
        "russia": "RU", "san marino": "SM", "scotland": "GB", "serbia": "RS",
        "slovakia": "SK", "slovenia": "SI", "spain": "ES", "sweden": "SE",
        "switzerland": "CH", "turkey": "TR", "ukraine": "UA", "united kingdom": "GB",
        "vatican": "VA", "wales": "GB",
    ]

    /// The reader-language name of a country given either an ISO code or an
    /// English name. Surveys and providers often hand a plain English name.
    static func name(forCountry country: String, language: String) -> String? {
        let trimmed = country.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }
        if trimmed.count == 2 { return name(trimmed, language: language) }
        if let code = byEnglishName[trimmed.lowercased()] { return name(code, language: language) }
        return nil
    }
}
