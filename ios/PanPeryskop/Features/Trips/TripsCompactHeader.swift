import SwiftUI

/// Compact sticky header for the trips sheet: shows the two team crests (soccer)
/// or the run distance, plus the event time/date. It appears once the hero has
/// scrolled away and tapping it scrolls back to the top.
struct TripsCompactHeader: View {
    let event: TravelEvent
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: Theme.Spacing.s) {
                if event.isRun {
                    Image(systemName: "figure.run")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.orange)
                    if let distance = distanceLabel {
                        Text(distance)
                            .font(.caption.weight(.bold))
                            .lineLimit(1)
                    }
                } else {
                    TeamCrest(name: event.home ?? "", code: event.metaData?.homeCode, colorHex: event.metaData?.homeColor, size: 26)
                    Text("vs")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    TeamCrest(name: event.away ?? "", code: event.metaData?.awayCode, colorHex: event.metaData?.awayColor, size: 26)
                }
                Spacer(minLength: Theme.Spacing.s)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(event.displayTime ?? "—")
                        .font(.caption.weight(.bold))
                    Text(shortDate)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
            .frame(height: 48)
            .frame(maxWidth: .infinity)
            .background(.regularMaterial)
            .overlay(alignment: .bottom) { Divider() }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
