import SwiftUI

/// Compact sticky header for the trips sheet. Mirrors ESPN's match gamestrip:
/// neutral background, two soft radial team-colour glows in the top corners,
/// crests with codes on the sides and the date over the time in the centre.
/// For runs the glow and the distance use the run's colour (light for short/easy,
/// dark for long/hard). It expands from the sheet handle once the hero scrolls away.
struct TripsCompactHeader: View {
    let event: TravelEvent
    let isVisible: Bool
    let onTap: () -> Void

    static let height: CGFloat = 56

    var body: some View {
        Button(action: onTap) {
            content
                .padding(.horizontal, Theme.Spacing.l)
                .frame(height: Self.height)
                .frame(maxWidth: .infinity)
                .background(background)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(height: isVisible ? Self.height : 0)
        .clipped()
        .opacity(isVisible ? 1 : 0)
        .animation(AppConstants.springSnappy, value: isVisible)
    }

    @ViewBuilder
    private var content: some View {
        if event.isRun {
            HStack(spacing: Theme.Spacing.s) {
                Image(systemName: "figure.run")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(runColor)
                Text(distanceLabel ?? event.title)
                    .font(.subheadline.weight(.bold))
                    .foregroundColor(runColor)
                    .lineLimit(1)
                Spacer(minLength: Theme.Spacing.s)
                dateTime
            }
        } else {
            HStack(spacing: Theme.Spacing.s) {
                TeamCrest(name: event.home ?? "", code: event.metaData?.homeCode, colorHex: event.metaData?.homeColor, size: 30)
                Text(event.metaData?.homeCode ?? "")
                    .font(.subheadline.weight(.bold))
                Spacer(minLength: Theme.Spacing.s)
                dateTime
                Spacer(minLength: Theme.Spacing.s)
                Text(event.metaData?.awayCode ?? "")
                    .font(.subheadline.weight(.bold))
                TeamCrest(name: event.away ?? "", code: event.metaData?.awayCode, colorHex: event.metaData?.awayColor, size: 30)
            }
        }
    }

    private var dateTime: some View {
        VStack(spacing: 0) {
            Text(shortDate)
                .font(.subheadline.weight(.bold))
            Text(event.displayTime ?? "—")
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    private var background: some View {
        ZStack {
            Rectangle().fill(.regularMaterial)
            RadialGradient(
                colors: [leadingGlow.opacity(0.8), .clear],
                center: UnitPoint(x: -0.02, y: -0.25),
                startRadius: 0,
                endRadius: 190
            )
            RadialGradient(
                colors: [trailingGlow.opacity(0.8), .clear],
                center: UnitPoint(x: 1.02, y: -0.25),
                startRadius: 0,
                endRadius: 190
            )
        }
        .overlay(alignment: .bottom) { Divider() }
    }

    private var leadingGlow: Color {
        event.isRun ? runColor : tint(event.metaData?.homeColor, name: event.home)
    }

    private var trailingGlow: Color {
        event.isRun ? runColor : tint(event.metaData?.awayColor, name: event.away)
    }

    private var runColor: Color { RunPalette.color(for: event) }

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
