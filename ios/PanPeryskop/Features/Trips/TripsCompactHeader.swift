import SwiftUI

/// Compact sticky header for the trips sheet: the two team crests (soccer) or the
/// run distance, plus the event time/date. It appears once the hero has scrolled
/// away and tapping it scrolls back to the top. Background carries the team
/// colours (soccer) or the run accent (orange).
struct TripsCompactHeader: View {
    let event: TravelEvent
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: Theme.Spacing.s) {
                if event.isRun {
                    Image(systemName: "figure.run")
                        .font(.subheadline.weight(.semibold))
                    if let distance = distanceLabel {
                        Text(distance)
                            .font(.caption.weight(.bold))
                            .lineLimit(1)
                    }
                } else {
                    TeamCrest(name: event.home ?? "", code: event.metaData?.homeCode, colorHex: event.metaData?.homeColor, size: 26)
                    Text("vs")
                        .font(.caption2)
                    TeamCrest(name: event.away ?? "", code: event.metaData?.awayCode, colorHex: event.metaData?.awayColor, size: 26)
                }
                Spacer(minLength: Theme.Spacing.s)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(event.displayTime ?? "—")
                        .font(.caption.weight(.bold))
                    Text(shortDate)
                        .font(.caption2)
                        .opacity(0.85)
                }
            }
            .foregroundColor(.white)
            .padding(.horizontal, Theme.Spacing.l)
            .frame(height: 48)
            .frame(maxWidth: .infinity)
            .background(headerGradient)
            .overlay(Color.black.opacity(0.12))
            .overlay(alignment: .bottom) { Divider() }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var headerGradient: LinearGradient {
        if event.isRun {
            return LinearGradient(
                colors: [Color.orange, Color.orange.opacity(0.8)],
                startPoint: .leading,
                endPoint: .trailing
            )
        }
        return LinearGradient(
            colors: [tint(event.metaData?.homeColor, name: event.home), tint(event.metaData?.awayColor, name: event.away)],
            startPoint: .leading,
            endPoint: .trailing
        )
    }

    private func tint(_ hex: String?, name: String?) -> Color {
        if let hex, let color = Color(hexString: hex) { return color }
        return TeamCrest.color(for: name ?? "")
    }

    private var distanceLabel: String? {
        let meta = event.metaData
        if let distance = meta?.distance, !distance.isEmpty { return distance }
        if let distances = meta?.distances, !distances.isEmpty {
            return distances.prefix(3).joined(separator: ", ")
        }
        return nil
    }

    private var shortDate: String {
        AppConstants.shortDayFormatter.string(from: event.displayDate)
    }
}
