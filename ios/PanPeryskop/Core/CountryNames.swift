import Foundation

enum CountryNames {
    static func name(_ code: String, language: String) -> String? {
        Locale(identifier: language).localizedString(forRegionCode: code.uppercased())
    }
}
