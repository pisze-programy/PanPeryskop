import SwiftUI
import CoreLocation

struct SoccerMatchBoard: View {
    let event: TravelEvent
    let onOpenURL: (URL) -> Void
    @State private var showMapPicker = false

    var body: some View {
        VStack(spacing: Theme.Spacing.m) {
            HStack(alignment: .top, spacing: Theme.Spacing.m) {
                teamColumn(event.home, code: event.metaData?.homeCode, color: event.metaData?.homeColor)
                centerStatus
                teamColumn(event.away, code: event.metaData?.awayCode, color: event.metaData?.awayColor)
            }
            Text(venueLabel)
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
        .padding(.horizontal, Theme.Spacing.l)
        .frame(maxWidth: .infinity)
        .background(heroGradient)
        .padding(.top, Theme.Spacing.s)
        .padding(.bottom, Theme.Spacing.m)
        .sheet(isPresented: $showMapPicker) {
            MapAppPickerSheet(
                coordinate: CLLocationCoordinate2D(latitude: event.lat, longitude: event.lng),
                title: event.title
            )
        }
    }

    /// Soft team-colour wash across the full sheet width (home left, away right).
    private var heroGradient: some View {
        LinearGradient(
            colors: [homeTint.opacity(0.18), .clear, awayTint.opacity(0.18)],
            startPoint: .leading,
            endPoint: .trailing
        )
    }

    private var homeTint: Color { tint(event.metaData?.homeColor, name: event.home) }
    private var awayTint: Color { tint(event.metaData?.awayColor, name: event.away) }

    private func tint(_ hex: String?, name: String?) -> Color {
        if let hex, let color = Color(hexString: hex) { return color }
        return TeamCrest.color(for: name ?? "")
    }

    private var venueLabel: String {
        if let venue = event.metaData?.venue, !venue.isEmpty { return venue }
        return "\(event.city), \(event.country)"
    }

    private var ticketURL: URL? {
        guard let link = event.link, let url = URL(string: link) else { return nil }
        return url
    }

    @ViewBuilder
    private func teamColumn(_ name: String?, code: String?, color: String?) -> some View {
        if let name {
            VStack(spacing: 6) {
                TeamCrest(name: name, code: code, colorHex: color)
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

/// Club crest mark. Uses the provider's three-letter code (BEL, FRA, …) and its
/// colour when present; falls back to the name's initials and a generated colour.
struct TeamCrest: View {
    let name: String
    var code: String?
    var colorHex: String?
    var size: CGFloat = 46

    var body: some View {
        ZStack {
            Image(systemName: "shield.fill")
                .font(.system(size: size))
                .foregroundStyle(
                    LinearGradient(
                        colors: [fill.opacity(0.92), fill],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
            Image(systemName: "shield")
                .font(.system(size: size))
                .foregroundStyle(Self.isLight(colorHex) ? Color.black.opacity(0.35) : Color.white.opacity(0.35))
            Text(displayCode)
                .font(.system(size: size * 0.3, weight: .heavy))
                .minimumScaleFactor(0.6)
                .padding(.horizontal, 3)
                .foregroundColor(Self.isLight(colorHex) ? .black : .white)
        }
    }

    private var fill: Color {
        if let colorHex, let color = Color(hexString: colorHex) { return color }
        return Self.color(for: name)
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

    /// True for light colours (white/gold) so the code switches to dark text.
    static func isLight(_ hex: String?) -> Bool {
        guard let hex, let value = UInt32(hex.replacingOccurrences(of: "#", with: ""), radix: 16) else {
            return false
        }
        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >> 8) & 0xFF) / 255
        let b = Double(value & 0xFF) / 255
        return (0.299 * r + 0.587 * g + 0.114 * b) > 0.6
    }

    private static let palette: [Color] = [.blue, .red, .green, .orange, .purple, .teal, .indigo, .pink, .brown]

    static func color(for name: String) -> Color {
        let sum = name.unicodeScalars.reduce(0) { $0 &+ Int($1.value) }
        return palette[abs(sum) % palette.count]
    }
}