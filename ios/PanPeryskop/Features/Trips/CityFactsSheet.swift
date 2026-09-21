import SwiftUI

/// Every city fact we hold, in one sheet.
struct CityFactsSheet: View {
    let city: TravelCity

    @Environment(\.dismiss) private var dismiss
    @Environment(\.region) private var region
    @State private var detent: PresentationDetent = .medium

    private var facts: CityFacts { city.facts }

    var body: some View {
        SheetShell(detent: $detent) {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    Text(city.displayName)
                        .font(.title3.weight(.bold))
                        .padding(.horizontal, Theme.Spacing.l)
                    ForEach(rows, id: \.label) { row in
                        factRow(row.label, row.value)
                    }
                }
                .padding(.vertical, Theme.Spacing.l)
            }
        }
    }

    private var rows: [(label: String, value: String)] {
        [
            ("Koszt życia", "\(region.price(Double(facts.costLocalUsd))) / miesiąc"),
            ("Na miejscu", "\(region.price(Double(max(1, facts.costLocalUsd / 30)))) / dzień"),
            ("Internet", "\(facts.internetMbps) Mb/s"),
            ("Temperatura teraz", temp(facts.tempNowC)),
            ("Wilgotność", "\(facts.humidityNow)%"),
            ("Jakość powietrza teraz", "\(facts.airQualityNow) AQI"),
            ("Jakość powietrza rocznie", "\(facts.airQualityYear) AQI"),
            ("Bezpieczeństwo", score(facts.safety)),
            ("Czystość", score(facts.cleanliness)),
            ("Rozrywka", score(facts.fun)),
            ("Nocne życie", score(facts.nightlife)),
            ("Pieszo", score(facts.walkability)),
            ("Opieka zdrowotna", score(facts.healthcare)),
            ("Angielski", score(facts.english)),
            ("Przyjazne LGBTQ+", score(facts.lgbtFriendly)),
            ("Przyjazne kobietom", score(facts.femaleFriendly)),
            ("Ogólnie", score(facts.overall)),
            ("Mieszkańcy", city.population.formatted(.number.notation(.compactName))),
        ]
    }

    private func factRow(_ label: String, _ value: String) -> some View {
        HStack(spacing: Theme.Spacing.m) {
            Text(label)
                .font(.subheadline)
            Spacer(minLength: Theme.Spacing.s)
            Text(value)
                .font(.subheadline.weight(.semibold))
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.s)
    }

    private func score(_ value: Double?) -> String {
        guard let value else { return region.scoreLabel(nil) }
        return "\(String(format: "%.1f", value)) · \(region.scoreLabel(value))"
    }

    private func temp(_ value: Double) -> String {
        "\(Int(value.rounded()))°C"
    }
}
