import Foundation

struct EuropaEventCountryGroup: Identifiable, Equatable {
    let id: String
    let title: String
    let events: [TravelEvent]

    static func groups(from events: [TravelEvent], language: String) -> [EuropaEventCountryGroup] {
        let locale = Locale(identifier: language)
        let grouped = Dictionary(grouping: events) { countryKey(for: $0, language: language) }
        return grouped
            .compactMap { buildGroup(id: $0.key, events: $0.value, language: language) }
            .sorted { compareGroups($0, $1, locale: locale) }
    }

    private static func buildGroup(
        id: String,
        events: [TravelEvent],
        language: String
    ) -> EuropaEventCountryGroup? {
        guard let sample = events.first else { return nil }
        return EuropaEventCountryGroup(
            id: id,
            title: countryTitle(for: sample, language: language),
            events: events
        )
    }

    private static func countryKey(for event: TravelEvent, language: String) -> String {
        if let rawCode = event.metaData?.countryCode?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased(),
           !rawCode.isEmpty {
            return rawCode
        }
        return countryTitle(for: event, language: language).lowercased()
    }

    private static func countryTitle(for event: TravelEvent, language: String) -> String {
        let byCode = event.metaData?.countryCode.flatMap { CountryNames.name($0, language: language) }
        let resolved = byCode ?? CountryNames.name(forCountry: event.country, language: language) ?? event.country
        return resolved.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func compareGroups(
        _ lhs: EuropaEventCountryGroup,
        _ rhs: EuropaEventCountryGroup,
        locale: Locale
    ) -> Bool {
        let order = lhs.title.compare(rhs.title, options: [.caseInsensitive], range: nil, locale: locale)
        if order != .orderedSame { return order == .orderedAscending }
        return lhs.id < rhs.id
    }
}
