import SwiftUI
import CoreLocation

struct SoccerMatchBoard: View {
    let event: TravelEvent
    let onOpenURL: (URL) -> Void
    @State private var showMapPicker = false

    var body: some View {
        VStack(spacing: Theme.Spacing.m) {
            HStack(alignment: .top, spacing: Theme.Spacing.m) {
                teamColumn(event.home, code: event.metaData?.homeCode)
                centerStatus
                teamColumn(event.away, code: event.metaData?.awayCode)
            }
            Text("\(event.city), \(event.country)")
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(1)
            VenueMap(
                coordinate: CLLocationCoordinate2D(latitude: event.lat, longitude: event.lng),
                systemImage: "sportscourt.fill",
                onTap: { showMapPicker = true }
            )
            if let ticketURL {
                CapsuleButton(title: "Zobacz więcej", fullWidth: true) {
                    onOpenURL(ticketURL)
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

    private var ticketURL: URL? {
        guard let link = event.link, let url = URL(string: link) else { return nil }
        return url
    }

    @ViewBuilder
    private func teamColumn(_ name: String?, code: String?) -> some View {
        if let name {
            VStack(spacing: 6) {
                TeamCrest(name: name, code: code)
                Text(name)
                    .font(.subheadline.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity)
            }
        } else {
            Color.clear.frame(height: 1)
        }
    }

    private var centerStatus: some View {
        VStack(spacing: 2) {
            Text(event.displayTime ?? "—")
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundColor(.primary)
            Text(dateLabel)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .frame(width: 78)
    }

    private var dateLabel: String {
        let date = event.displayDate
        let day = AppConstants.shortDayFormatter.string(from: date)
        let weekday = AppConstants.weekdayFormatter.string(from: date)
        return "\(day) · \(weekday)"
    }
}

/// Club crest mark. Uses the provider's three-letter code (BEL, FRA, …) when
/// present; falls back to the name's initials.
struct TeamCrest: View {
    let name: String
    var code: String?
    var size: CGFloat = 46

    var body: some View {
        ZStack {
            Image(systemName: "shield.fill")
                .font(.system(size: size))
                .foregroundStyle(
                    LinearGradient(
                        colors: [Self.color(for: name).opacity(0.85), Self.color(for: name)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
            Image(systemName: "shield")
                .font(.system(size: size))
                .foregroundStyle(Color.gray.opacity(0.55))
            Text(displayCode)
                .font(.system(size: size * 0.3, weight: .heavy))
                .minimumScaleFactor(0.6)
                .padding(.horizontal, 3)
                .foregroundColor(.white)
        }
    }

    private var displayCode: String {
        if let code, !code.isEmpty { return code.uppercased() }
        return Self.initials(name)
    }

    static func initials(_ name: String) -> String {
        let words = name.split(separator: " ").prefix(2)
        let letters = words.compactMap { $0.first }.map(String.init)
        return letters.joined().uppercased()
    }

    private static let palette: [Color] = [.blue, .red, .green, .orange, .purple, .teal, .indigo, .pink, .brown]

    static func color(for name: String) -> Color {
        let sum = name.unicodeScalars.reduce(0) { $0 &+ Int($1.value) }
        return palette[abs(sum) % palette.count]
    }
}