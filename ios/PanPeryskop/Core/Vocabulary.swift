import Foundation

/// Provider words that must reach the user in their own language. The value is
/// a word map per language; a missing key falls back to the original string, so
/// an unknown provider value is shown rather than hidden.
enum Vocabulary {
    static func word(_ key: String, language: String) -> String? {
        byLanguage[code(of: language)]?[key.lowercased().trimmingCharacters(in: .whitespaces)]
    }

    private static func code(of language: String) -> String {
        String(language.prefix { $0 != "_" && $0 != "-" }).lowercased()
    }

    private static let byLanguage: [String: [String: String]] = [
        "pl": polish,
    ]

    private static let polish: [String: String] = [
        "marathon": "Maraton",
        "half marathon": "Półmaraton",
        "ultra marathon": "Ultramaraton",
        "ultramarathon": "Ultramaraton",
    ]
}
