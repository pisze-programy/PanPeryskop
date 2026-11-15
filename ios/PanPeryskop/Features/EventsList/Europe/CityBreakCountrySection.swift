import Foundation

struct CityBreakCountrySection: Identifiable, Equatable {
    let id: String
    let title: String
    let cities: [TravelCity]

    static func sections(from cities: [TravelCity], language: String) -> [CityBreakCountrySection] {
        let locale = Locale(identifier: language)
        let grouped = Dictionary(grouping: cities) { countryKey(for: $0, language: language) }
        return grouped
            .compactMap { buildSection(id: $0.key, cities: $0.value, language: language, locale: locale) }
            .sorted { compareSections($0, $1, locale: locale) }
    }

    static func rankedCities(_ cities: [TravelCity]) -> [TravelCity] {
        cities.sorted { compareRanked($0, $1) }
    }

    private static func buildSection(
        id: String,
        cities: [TravelCity],
        language: String,
        locale: Locale
    ) -> CityBreakCountrySection? {
        guard let sample = cities.first else { return nil }
        let sortedCities = cities.sorted { compareCitiesByName($0, $1, locale: locale) }
        return CityBreakCountrySection(
            id: id,
            title: countryTitle(for: sample, language: language),
            cities: sortedCities
        )
    }

    private static func countryKey(for city: TravelCity, language: String) -> String {
        let code = city.countryCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if !code.isEmpty { return code }
        return countryTitle(for: city, language: language).lowercased()
    }

    private static func countryTitle(for city: TravelCity, language: String) -> String {
        let resolved = city.countryName(language: language).trimmingCharacters(in: .whitespacesAndNewlines)
        if !resolved.isEmpty { return resolved }
        return city.country.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func compareSections(
        _ lhs: CityBreakCountrySection,
        _ rhs: CityBreakCountrySection,
        locale: Locale
    ) -> Bool {
        let order = lhs.title.compare(rhs.title, options: [.caseInsensitive], range: nil, locale: locale)
        if order != .orderedSame { return order == .orderedAscending }
        return lhs.id < rhs.id
    }

    private static func compareCitiesByName(
        _ lhs: TravelCity,
        _ rhs: TravelCity,
        locale: Locale
    ) -> Bool {
        let order = lhs.displayName.compare(rhs.displayName, options: [.caseInsensitive], range: nil, locale: locale)
        if order != .orderedSame { return order == .orderedAscending }
        return lhs.id < rhs.id
    }

    private static func compareRanked(_ lhs: TravelCity, _ rhs: TravelCity) -> Bool {
        if lhs.reachable != rhs.reachable { return lhs.reachable }
        let lhsScore = recommendedScore(for: lhs)
        let rhsScore = recommendedScore(for: rhs)
        if lhsScore != rhsScore { return lhsScore > rhsScore }
        return compareBySize(lhs, rhs)
    }

    private static func compareBySize(_ lhs: TravelCity, _ rhs: TravelCity) -> Bool {
        if lhs.population != rhs.population { return lhs.population > rhs.population }
        let order = lhs.displayName.localizedCaseInsensitiveCompare(rhs.displayName)
        if order != .orderedSame { return order == .orderedAscending }
        return lhs.id < rhs.id
    }

    private static func recommendedScore(for city: TravelCity) -> Double {
        guard let score = city.facts.overall, score.isFinite else { return 0 }
        return score
    }
}
