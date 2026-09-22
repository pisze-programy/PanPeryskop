import SwiftUI

struct CityWeatherSection: View {
    let city: TravelCity

    @Environment(\.region) private var region

    private var facts: CityFacts { city.facts }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TripsSectionHeader(title: "Pogoda")
                .padding(.horizontal, Theme.Spacing.l)
            SurfaceCard {
                HStack(spacing: 0) {
                    segment(value: "\(Int(facts.tempNowC.rounded()))°C", label: "Temperatura")
                    divider
                    segment(value: "\(facts.humidityNow)%", label: "Wilgotność")
                    divider
                    segment(
                        value: region.airQualityLabel(facts.airQualityNow),
                        suffix: "\(facts.airQualityNow) AQI",
                        label: "Powietrze"
                    )
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
        }
    }

    private var divider: some View {
        Divider().frame(height: 40)
    }

    private func segment(value: String, suffix: String? = nil, label: String) -> some View {
        VStack(spacing: Theme.Spacing.xs) {
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value)
                    .font(.headline.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let suffix {
                    Text(suffix)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
    }
}
