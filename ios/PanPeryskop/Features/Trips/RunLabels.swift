import Foundation

/// Polish labels for the running providers' raw surface/difficulty values.
enum RunLabels {
    static func text(_ raw: String?) -> String? {
        guard let raw, !raw.isEmpty else { return nil }
        return map[raw.lowercased()] ?? raw
    }

    private static let map: [String: String] = [
        "asphalt": "Asfalt",
        "road": "Droga",
        "trail": "Szlak",
        "mixed": "Mieszana",
        "terrain": "Teren",
        "track": "Bieżnia",
        "urban trail": "Szlak miejski",
        "indoor": "Hala",
        "flat": "płaski",
        "hilly": "pagórkowaty",
        "rolling": "falisty",
        "extreme": "ekstremalny",
        "undulating": "połagodny",
    ]
}
