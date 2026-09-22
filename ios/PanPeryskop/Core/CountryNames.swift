import Foundation

enum CountryNames {
    static func name(_ code: String, language: String) -> String? {
        byLanguage[language]?[code.uppercased()]
    }

    private static let byLanguage: [String: [String: String]] = [
        "pl": polish,
    ]

    private static let polish: [String: String] = [
        "AD": "Andora", "AL": "Albania", "AM": "Armenia", "AT": "Austria",
        "AZ": "Azerbejdżan", "BA": "Bośnia i Hercegowina", "BE": "Belgia",
        "BG": "Bułgaria", "BY": "Białoruś", "CH": "Szwajcaria", "CY": "Cypr",
        "CZ": "Czechy", "DE": "Niemcy", "DK": "Dania", "EE": "Estonia",
        "ES": "Hiszpania", "FI": "Finlandia", "FR": "Francja", "GB": "Wielka Brytania",
        "GE": "Gruzja", "GI": "Gibraltar", "GR": "Grecja", "HR": "Chorwacja",
        "HU": "Węgry", "IE": "Irlandia", "IS": "Islandia", "IT": "Włochy",
        "JE": "Jersey", "LT": "Litwa", "LU": "Luksemburg", "LV": "Łotwa",
        "MC": "Monako", "MD": "Mołdawia", "ME": "Czarnogóra", "MK": "Macedonia Północna",
        "MT": "Malta", "NL": "Holandia", "NO": "Norwegia", "PL": "Polska",
        "PT": "Portugalia", "RO": "Rumunia", "RS": "Serbia", "RU": "Rosja",
        "SE": "Szwecja", "SI": "Słowenia", "SK": "Słowacja", "TR": "Turcja",
        "UA": "Ukraina", "VA": "Watykan", "XK": "Kosowo",
    ]
}
