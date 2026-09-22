import SwiftUI

struct CityFactsSheet: View {
    let city: TravelCity

    @Environment(\.dismiss) private var dismiss
    @Environment(\.region) private var region
    @State private var detent: PresentationDetent = .medium

    private var facts: CityFacts { city.facts }

    private struct Row {
        let label: String
        let value: String
        var positive: Bool? = nil
    }

    var body: some View {
        SheetShell(detent: $detent) {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    Text(city.displayName)
                        .font(.title3.weight(.bold))
                        .padding(.horizontal, Theme.Spacing.l)
                    ForEach(rows, id: \.label) { row in
                        factRow(row)
                    }
                }
                .padding(.vertical, Theme.Spacing.l)
            }
        }
    }

    private var rows: [Row] {
        [
            Row(label: "Koszt życia", value: "\(region.price(Double(facts.costLocalUsd))) / miesiąc"),
            Row(label: "Na miejscu", value: "\(region.price(Double(max(1, facts.costLocalUsd / 30)))) / dzień"),
            Row(label: "Internet", value: "\(facts.internetMbps) Mb/s"),
            Row(label: "Temperatura", value: temp(facts.tempNowC)),
            Row(label: "Wilgotność", value: "\(facts.humidityNow)%"),
            Row(label: "Powietrze", value: "\(region.airQualityLabel(facts.airQualityNow)), \(facts.airQualityNow) AQI"),
            Row(label: "Powietrze rocznie", value: "\(region.airQualityLabel(facts.airQualityYear)), \(facts.airQualityYear) AQI"),
            Row(label: "Bezpieczeństwo", value: score(facts.safety), positive: region.isPositiveScore(facts.safety)),
            Row(label: "Czystość", value: score(facts.cleanliness), positive: region.isPositiveScore(facts.cleanliness)),
            Row(label: "Rozrywka", value: score(facts.fun), positive: region.isPositiveScore(facts.fun)),
            Row(label: "Nocne życie", value: score(facts.nightlife), positive: region.isPositiveScore(facts.nightlife)),
            Row(label: "Zwiedzanie pieszo", value: score(facts.walkability), positive: region.isPositiveScore(facts.walkability)),
            Row(label: "Opieka zdrowotna", value: score(facts.healthcare), positive: region.isPositiveScore(facts.healthcare)),
            Row(label: "Angielski", value: score(facts.english), positive: region.isPositiveScore(facts.english)),
            Row(label: "Przyjazne LGBTQ+", value: score(facts.lgbtFriendly), positive: region.isPositiveScore(facts.lgbtFriendly)),
            Row(label: "Przyjazne kobietom", value: score(facts.femaleFriendly), positive: region.isPositiveScore(facts.femaleFriendly)),
            Row(label: "Ocena", value: score(facts.overall), positive: region.isPositiveScore(facts.overall)),
            Row(label: "Mieszkańcy", value: city.population.formatted(.number.notation(.compactName))),
        ]
    }

    private func factRow(_ row: Row) -> some View {
        HStack(spacing: Theme.Spacing.m) {
            Text(row.label)
                .font(.subheadline)
            Spacer(minLength: Theme.Spacing.s)
            Text(row.value)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(color(for: row.positive))
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.s)
    }

    private func color(for positive: Bool?) -> Color {
        guard let positive else { return .primary }
        return positive ? .green : .red
    }

    private func score(_ value: Double?) -> String {
        region.scoreLabel(value)
    }

    private func temp(_ value: Double) -> String {
        "\(Int(value.rounded()))°C"
    }
}
