import SwiftUI

/// Soccer match board — the hero of the Wycieczki sheet. Two teams with generated
/// crests on the sides, kickoff time in the middle, venue below.
struct SoccerMatchBoard: View {
    let event: TravelEvent

    var body: some View {
        VStack(spacing: Theme.Spacing.m) {
            HStack(alignment: .top, spacing: Theme.Spacing.m) {
                teamColumn(event.home)
                centerStatus
                teamColumn(event.away)
            }
            Text("\(event.city), \(event.country)")
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Theme.Spacing.s)
        .padding(.bottom, Theme.Spacing.m)
    }

    @ViewBuilder
    private func teamColumn(_ name: String?) -> some View {
        if let name {
            VStack(spacing: 6) {
                TeamCrest(name: name)
                Text(name)
                    .font(.subheadline.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .frame(maxWidth: .infinity)
            }
        } else {
            Color.clear.frame(height: 1)
        }
    }

    private var centerStatus: some View {
        VStack(spacing: 2) {
            Text(event.hour)
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundColor(.primary)
            Text(dateLabel)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .frame(width: 78)
    }

    private var dateLabel: String {
        let date = Date(timeIntervalSince1970: TimeInterval(event.start_ms) / 1000)
        let day = AppConstants.shortDayFormatter.string(from: date)
        let weekday = AppConstants.weekdayFormatter.string(from: date)
        return "\(day) · \(weekday)"
    }
}

/// Generated club crest — no logos in the data, so a colored shield with initials.
struct TeamCrest: View {
    let name: String
    var size: CGFloat = 46

    var body: some View {
        ZStack {
            Image(systemName: "shield.fill")
                .font(.system(size: size))
                .foregroundStyle(Self.color(for: name).gradient)
            Text(Self.initials(name))
                .font(.system(size: size * 0.32, weight: .heavy))
                .foregroundColor(.white)
        }
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