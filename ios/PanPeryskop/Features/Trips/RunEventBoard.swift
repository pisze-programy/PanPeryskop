import SwiftUI
import CoreLocation

/// Run event board — the hero of the Wycieczki sheet for `biegi`. Races have no
/// two teams, so the distance is the headline, with start time, surface/price
/// details and the venue map below.
struct RunEventBoard: View {
    let event: TravelEvent

    private var meta: TravelEventMeta? { event.metaData }

    private var distanceLabel: String {
        if let d = meta?.distance, !d.isEmpty { return d }
        if let ds = meta?.distances, !ds.isEmpty { return ds.prefix(3).joined(separator: ", ") }
        return "Bieg"
    }

    private var detail: String? {
        let parts = [meta?.surface, meta?.difficulty, meta?.price]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(spacing: Theme.Spacing.m) {
            HStack(alignment: .top, spacing: Theme.Spacing.m) {
                icon
                VStack(alignment: .leading, spacing: 3) {
                    Text(distanceLabel)
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                    if let detail {
                        Text(detail)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                timeColumn
            }
            Text("\(event.city), \(event.country)")
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(1)
            VenueMap(
                coordinate: CLLocationCoordinate2D(latitude: event.lat, longitude: event.lng),
                systemImage: "figure.run"
            )
            .padding(.horizontal, Theme.Spacing.l)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.s)
        .padding(.bottom, Theme.Spacing.m)
    }

    private var icon: some View {
        ZStack {
            Circle()
                .fill(Color.orange.opacity(0.15))
                .frame(width: 46, height: 46)
            Image(systemName: "figure.run")
                .font(.system(size: 22, weight: .semibold))
                .foregroundColor(.orange)
        }
    }

    private var timeColumn: some View {
        VStack(spacing: 2) {
            if let time = meta?.time {
                Text(time)
                    .font(.system(size: 24, weight: .bold, design: .rounded))
            }
            Text(dateLabel)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .frame(width: 78, alignment: .trailing)
    }

    private var dateLabel: String {
        let date = Date(timeIntervalSince1970: TimeInterval(event.start_ms) / 1000)
        let day = AppConstants.shortDayFormatter.string(from: date)
        let weekday = AppConstants.weekdayFormatter.string(from: date)
        return "\(day) · \(weekday)"
    }
}