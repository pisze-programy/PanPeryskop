import SwiftUI
import CoreLocation

struct CityEventsSection: View {
    let city: TravelCity
    let origins: [String]
    let onSelect: (TravelEvent) -> Void

    @State private var events: [TravelEvent] = []

    private static let radiusKm = 50.0
    private static let cardWidth: CGFloat = 220

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
        HStack(alignment: .top, spacing: Theme.Spacing.s) {
            categoryBadge(event)
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text(event.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text(whenLabel(event))
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                Text(whereLabel(event))
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .frame(width: Self.cardWidth, alignment: .leading)
        .padding(Theme.Spacing.m)
        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
        .contentShape(Rectangle())
    }

    private func categoryBadge(_ event: TravelEvent) -> some View {
        let style = event.pinStyle
        return ZStack {
            LinearGradient(
                colors: [
                    Color(hex: style?.startHex ?? 0x0d48bd),
                    Color(hex: style?.endHex ?? 0xc6007e),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Image(systemName: style?.icon ?? "sportscourt.fill")
                .font(.caption.weight(.bold))
                .foregroundColor(.white)
        }
        .frame(width: 36, height: 36)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.chip))
    }

    private func whenLabel(_ event: TravelEvent) -> String {
        let day = AppConstants.shortDayFormatter.string(from: event.displayDate)
        let weekday = AppConstants.weekdayFormatter.string(from: event.displayDate)
        guard let time = event.displayTime, time != AppConstants.unknownTime, !time.isEmpty else {
            return "\(weekday) \(day)"
        }
        return "\(weekday) \(day), \(time)"
    }

    private func whereLabel(_ event: TravelEvent) -> String {
        let place = "\(event.city) · \(distanceKm(to: event)) km"
        let detail = event.isRun ? RunDistances.range(event.metaData) : event.metaData?.league
        guard let detail, !detail.isEmpty else { return place }
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
        let response = try? await APIClient.getTravelEventsNear(
            lat: city.lat,
            lng: city.lng,
            radiusKm: Self.radiusKm,
            from: from,
            to: to,
            tags: tags,
            origins: origins
        )
        guard !Task.isCancelled else { return }
        events = (response?.events ?? []).sorted { $0.start_ms < $1.start_ms }
    }
}
