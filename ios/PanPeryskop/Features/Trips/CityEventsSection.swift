import SwiftUI

struct CityEventsSection: View {
    let city: TravelCity
    let onSelect: (TravelEvent) -> Void

    @State private var events: [TravelEvent] = []
    @State private var loaded = false

    private static let radiusKm = 50.0
    private static let horizonDays = 120
    private static let cardWidth: CGFloat = 168
    private static let cardHeight: CGFloat = 92

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "pl_PL")
        formatter.dateFormat = "d MMM, HH:mm"
        return formatter
    }()

    var body: some View {
        Group {
            if !events.isEmpty {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    TripsSectionHeader(title: "Wydarzenia w okolicy")
                        .padding(.horizontal, Theme.Spacing.l)
                    slider
                }
                .padding(.top, Theme.Spacing.section)
            }
        }
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
            Text(event.title)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
            Text(Self.dayFormatter.string(from: event.displayDate))
                .font(.caption)
                .foregroundColor(.secondary)
            Text(event.city)
                .font(.caption2)
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
        .frame(width: Self.cardWidth, height: Self.cardHeight, alignment: .leading)
        .padding(Theme.Spacing.m)
        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
        .contentShape(Rectangle())
    }

    private func load() async {
        let now = Date()
        let from = Int64(now.timeIntervalSince1970 * 1000)
        let to = Int64(now.addingTimeInterval(Double(Self.horizonDays) * 86_400).timeIntervalSince1970 * 1000)
        let tags = "\(TripsViewModel.TravelTag.runs.rawValue),\(TripsViewModel.TravelTag.football.rawValue)"
        let response = try? await APIClient.getTravelEventsNear(
            lat: city.lat,
            lng: city.lng,
            radiusKm: Self.radiusKm,
            from: from,
            to: to,
            tags: tags
        )
        guard !Task.isCancelled else { return }
        events = (response?.events ?? []).sorted { $0.start_ms < $1.start_ms }
        loaded = true
    }
}
