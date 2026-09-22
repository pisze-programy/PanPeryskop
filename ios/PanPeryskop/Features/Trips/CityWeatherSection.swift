import SwiftUI
struct CityWeatherSection: View {
    let city: TravelCity

    private var facts: CityFacts { city.facts }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TripsSectionHeader(title: "Pogoda")
                .padding(.horizontal, Theme.Spacing.l)
            SurfaceCard {
                HStack(spacing: 0) {
                    temperature
                    Divider().frame(height: 44)
                    column("Wilgotność", "\(facts.humidityNow)%")
                    Divider().frame(height: 44)
                    column("Powietrze", "\(facts.airQualityNow) AQI")
                }
                .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, Theme.Spacing.l)
        }
    }

    private var temperature: some View {
        VStack(spacing: Theme.Spacing.xs) {
            Text("\(Int(facts.tempNowC.rounded()))°C")
                .font(.title.weight(.bold))
            Text("teraz")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private func column(_ label: String, _ value: String) -> some View {
        VStack(spacing: Theme.Spacing.xs) {
            Text(value)
                .font(.headline.weight(.semibold))
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
