import SwiftUI

/// Compact sticky header for the trips sheet. Mirrors ESPN's match gamestrip:
/// neutral background, two soft radial team-colour glows in the top corners,
/// crests with codes on the sides and the date over the time in the centre.
/// For runs the glow and the distance use the run's colour (light for short/easy,
/// dark for long/hard). `progress` (0…1) is driven by the hero scroll offset, so
/// the bar grows continuously out of the hero instead of popping in.
struct TripsCompactHeader: View {
    let event: TravelEvent
    let progress: Double
    let onTap: () -> Void

    static let height: CGFloat = 56

    private var t: Double { min(max(progress, 0), 1) }

    var body: some View {
        Button(action: onTap) {
            content
                .padding(.horizontal, Theme.Spacing.l)
                .frame(height: Self.height, alignment: .bottom)
                .frame(maxWidth: .infinity)
                .background(background)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(height: Self.height * CGFloat(t), alignment: .top)
        .clipped()
        .opacity(t)
        .allowsHitTesting(t > 0.5)
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
            glow(leadingGlow, from: UnitPoint(x: 0, y: 0))
            glow(trailingGlow, from: UnitPoint(x: 1, y: 0))
        }
    }

    /// A corner glow that fades out long before the centre, so the two glows
    /// overlap softly and never leave a seam between them.
    private func glow(_ color: Color, from center: UnitPoint) -> some View {
        RadialGradient(
            stops: [
                .init(color: color.opacity(0.55), location: 0),
                .init(color: color.opacity(0.16), location: 0.45),
                .init(color: .clear, location: 1),
            ],
            center: center,
            startRadius: 0,
            endRadius: 280
        )
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
