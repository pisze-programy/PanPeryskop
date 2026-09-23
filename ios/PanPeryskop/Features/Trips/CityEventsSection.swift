import SwiftUI
import CoreLocation

struct CityEventsSection: View {
    let city: TravelCity
    let origins: [String]
    let onSelect: (TravelEvent) -> Void

    @Environment(\.region) private var region
    @State private var events: [TravelEvent] = []

    private static let radiusKm = 50.0
    private static let cardWidth: CGFloat = 240
    private static let crestSize: CGFloat = 32

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            if !events.isEmpty {
                TripsSectionHeader(title: "Wydarzenia w okolicy")
                    .padding(.horizontal, Theme.Spacing.l)
                slider
            }
            Color.clear.frame(height: 0)
        }
        .padding(.top, Theme.Spacing.section)
        .task(id: city.id) { await load() }
    }

    private var slider: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.Spacing.s) {
                ForEach(events) { event in
                    card(event)
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
        }
    }

    private func card(_ event: TravelEvent) -> some View {
        Button {
            Haptics.selection()
            onSelect(event)
        } label: {
            cardLabel(event)
        }
        .buttonStyle(.plain)
    }

    private func cardLabel(_ event: TravelEvent) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            badge(event)
            content(event)
            foot(event)
        }
        .frame(width: Self.cardWidth, alignment: .topLeading)
        .padding(Theme.Spacing.m)
        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                .stroke(Theme.Palette.hairline, lineWidth: 0.5)
        )
        .contentShape(Rectangle())
    }

    private func badge(_ event: TravelEvent) -> some View {
        HStack(spacing: Theme.Spacing.xs) {
            Image(systemName: categoryIcon(event))
                .font(.caption2.weight(.bold))
            Text(categoryLabel(event))
                .font(.caption2.weight(.bold))
                .tracking(0.5)
            Spacer(minLength: 0)
            Text(whenLabel(event))
                .font(.caption2)
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
        .foregroundColor(categoryColor(event))
    }

    @ViewBuilder
    private func content(_ event: TravelEvent) -> some View {
        if event.isRun {
            runContent(event)
        } else {
            matchContent(event)
        }
    }

    private func matchContent(_ event: TravelEvent) -> some View {
        HStack(spacing: Theme.Spacing.s) {
            crest(event.home, code: event.metaData?.homeCode, color: event.metaData?.homeColor)
            Text(event.title)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
            crest(event.away, code: event.metaData?.awayCode, color: event.metaData?.awayColor)
        }
    }

    private func crest(_ name: String?, code: String?, color: String?) -> some View {
        TeamCrest(name: name ?? "", code: code, colorHex: color, size: Self.crestSize)
    }

    private func runContent(_ event: TravelEvent) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack(spacing: Theme.Spacing.s) {
                Image(systemName: "figure.run")
                    .font(.title3.weight(.semibold))
                    .foregroundColor(RunPalette.color(for: event))
                Text(event.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            distanceChips(event)
        }
    }

    @ViewBuilder
    private func distanceChips(_ event: TravelEvent) -> some View {
        let distances = RunDistances.tags(event.metaData, language: region.languageCode)
        if !distances.isEmpty {
            HStack(spacing: Theme.Spacing.xs) {
                ForEach(distances, id: \.self) { distance in
                    DistanceTag(label: distance, tint: RunPalette.color(for: event))
                }
            }
        }
    }

    private func foot(_ event: TravelEvent) -> some View {
        Text(footLabel(event))
            .font(.caption2)
            .foregroundColor(.secondary)
            .lineLimit(1)
    }

    private func categoryIcon(_ event: TravelEvent) -> String {
        event.isRun ? "figure.run" : "sportscourt.fill"
    }

    private func categoryLabel(_ event: TravelEvent) -> String {
        event.isRun ? "BIEG" : "MECZ"
    }

    private func categoryColor(_ event: TravelEvent) -> Color {
        event.isRun ? RunPalette.color(for: event) : .accentColor
    }

    private func whenLabel(_ event: TravelEvent) -> String {
        let day = AppConstants.shortDayFormatter.string(from: event.displayDate)
        let weekday = AppConstants.weekdayFormatter.string(from: event.displayDate)
        guard let time = event.displayTime, time != AppConstants.unknownTime, !time.isEmpty else {
            return "\(weekday) \(day)"
        }
        return "\(weekday) \(day), \(time)"
    }

    private func footLabel(_ event: TravelEvent) -> String {
        let place = "\(event.city) · \(distanceKm(to: event)) km"
        guard let league = event.metaData?.league, !league.isEmpty else { return place }
        return "\(league) · \(place)"
    }

    private func distanceKm(to event: TravelEvent) -> Int {
        let meters = CLLocation(latitude: city.lat, longitude: city.lng)
            .distance(from: CLLocation(latitude: event.lat, longitude: event.lng))
        return Int((meters / 1000).rounded())
    }

    private func load() async {
        let now = Date()
        let from = Int64(now.timeIntervalSince1970 * 1000)
        let to = Int64(now.addingTimeInterval(Double(AppConstants.travelHorizonDays) * 86_400).timeIntervalSince1970 * 1000)
        let tags = "\(TripsViewModel.TravelTag.runs.rawValue),\(TripsViewModel.TravelTag.football.rawValue)"
        do {
            let response = try await APIClient.getTravelEventsNear(
                lat: city.lat,
                lng: city.lng,
                radiusKm: Self.radiusKm,
                from: from,
                to: to,
                tags: tags,
                origins: origins
            )
            guard !Task.isCancelled else { return }
            events = response.events
                .filter { Double(distanceKm(to: $0)) <= Self.radiusKm }
                .sorted { $0.start_ms < $1.start_ms }
        } catch {
            guard !(error is CancellationError) else { return }
            print("Failed to load city events:", error)
        }
    }
}
