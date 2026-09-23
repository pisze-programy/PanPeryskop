import SwiftUI
import CoreLocation

struct CityEventsSection: View {
    let city: TravelCity
    let origins: [String]
    let onSelect: (TravelEvent) -> Void

    @Environment(\.region) private var region
    @Environment(\.colorScheme) private var colorScheme
    @State private var events: [TravelEvent] = []

    private static let radiusKm = 50.0
    private static let cardWidth: CGFloat = 240
    private static let cardHeight: CGFloat = 104

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
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            categoryLine(event)
            Text(event.title)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
            Spacer(minLength: 0)
            Text(whereLabel(event))
                .font(.caption2)
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
        .frame(width: Self.cardWidth, height: Self.cardHeight, alignment: .topLeading)
        .padding(Theme.Spacing.m)
        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                .stroke(Theme.Palette.hairline, lineWidth: 0.5)
        )
        .contentShape(Rectangle())
    }

    private func categoryLine(_ event: TravelEvent) -> some View {
        HStack(spacing: Theme.Spacing.xs) {
            Text(whenLabel(event))
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(1)
            Spacer(minLength: 0)
            Image(systemName: event.isRun ? "figure.run" : "sportscourt.fill")
                .font(.caption.weight(.semibold))
                .foregroundColor(Theme.Palette.neutral(colorScheme))
        }
    }

    private func whenLabel(_ event: TravelEvent) -> String {
        let day = AppConstants.shortDayFormatter.string(from: event.displayDate)
        let weekday = AppConstants.weekdayFormatter.string(from: event.displayDate)
        guard let time = event.displayTime, time != AppConstants.unknownTime, !time.isEmpty else {
            return "\(weekday) \(day)"
        }
        return "\(weekday) \(day), \(time)"
    }

    private func detailLabel(_ event: TravelEvent) -> String? {
        guard event.isRun else { return nil }
        return RunDistances.range(event.metaData, language: region.languageCode)
    }

    private func whereLabel(_ event: TravelEvent) -> String {
        let place = "\(event.city) · \(distanceKm(to: event)) km"
        guard let detail = detailLabel(event) else { return place }
        return "\(detail) · \(place)"
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
