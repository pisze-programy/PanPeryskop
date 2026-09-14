import SwiftUI
import CoreLocation

struct RunEventBoard: View {
    let event: TravelEvent
    let onOpenURL: (URL) -> Void
    @State private var showMapPicker = false

    private var meta: TravelEventMeta? { event.metaData }

    private var distanceLabel: String? {
        if let d = meta?.distance, !d.isEmpty { return d }
        if let ds = meta?.distances, !ds.isEmpty { return ds.prefix(3).joined(separator: ", ") }
        return nil
    }

    private var detail: String? {
        let parts = [meta?.surface, meta?.difficulty]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var priceLabel: String? {
        guard let price = meta?.price, !price.isEmpty else { return nil }
        return price
    }

    private var ticketURL: URL? {
        let raw = event.link ?? meta?.website
        guard let raw, let url = URL(string: raw) else { return nil }
        return url
    }

    var body: some View {
        VStack(spacing: Theme.Spacing.m) {
            HStack(alignment: .top, spacing: Theme.Spacing.m) {
                icon
                VStack(alignment: .leading, spacing: 3) {
                    Text(event.title)
                        .font(.headline.weight(.bold))
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    if let distanceLabel {
                        Text(distanceLabel)
                            .font(.title3.weight(.bold))
                            .foregroundColor(.orange)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    if let detail {
                        Text(detail)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(2)
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
                systemImage: "figure.run",
                onTap: { showMapPicker = true }
            )
            if let ticketURL {
                if let priceLabel {
                    CapsuleButton(title: "Zapisz się", trailingText: priceLabel, fullWidth: true) {
                        onOpenURL(ticketURL)
                    }
                } else {
                    CapsuleButton(title: "Zobacz więcej", fullWidth: true) {
                        onOpenURL(ticketURL)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.s)
        .padding(.bottom, Theme.Spacing.m)
        .sheet(isPresented: $showMapPicker) {
            MapAppPickerSheet(
                coordinate: CLLocationCoordinate2D(latitude: event.lat, longitude: event.lng),
                title: event.title
            )
        }
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
