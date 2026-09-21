import SwiftUI

/// Sticky bar at the top of a trips page. It is the page's top inset, so it stays
/// glued to the top while the page scrolls under it.
struct TripsGamestrip: View {
    let event: TravelEvent
    var dotsCount = 1
    var dotsIndex = 0
    let onTap: () -> Void

    private static let crestSize: CGFloat = 44
    private static let runIconSize: CGFloat = 22
    private static let rowHeight: CGFloat = 58
    private static let badgeSpacing: CGFloat = 8
    private static let centerSpacing: CGFloat = 1
    private static let detailSpacing: CGFloat = 4
    private static let separator = " · "

    private var meta: TravelEventMeta? { event.metaData }

    private var league: String? {
        guard !event.isRun, let league = meta?.league, !league.isEmpty else { return nil }
        return league
    }

    var body: some View {
        Button(action: onTap) {
            bar
        }
        .buttonStyle(.plain)
    }

    private var bar: some View {
        StickyBar(leadingColor: leadingGlow, trailingColor: trailingGlow) {
            VStack(spacing: 0) {
                if let league {
                    Text(league)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity)
                        .padding(.horizontal, Theme.Spacing.l)
                }
                row
                    .frame(height: Self.rowHeight)
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.top, league == nil ? 0 : Self.badgeSpacing)
                    .frame(maxWidth: .infinity)
                dots
            }
            .contentShape(Rectangle())
        }
    }

    @ViewBuilder
    private var dots: some View {
        if dotsCount > 1 {
            PageDots(count: dotsCount, index: dotsIndex)
        }
    }

    @ViewBuilder
    private var row: some View {
        if event.isRun {
            runRow
        } else {
            soccerRow
        }
    }

    private var soccerRow: some View {
        HStack(spacing: Theme.Spacing.s) {
            TeamBadge(
                name: event.home,
                code: meta?.homeCode,
                colorHex: meta?.homeColor,
                isLeading: true
            )
            .frame(maxWidth: .infinity, alignment: .leading)

            centerStatus

            TeamBadge(
                name: event.away,
                code: meta?.awayCode,
                colorHex: meta?.awayColor,
                isLeading: false
            )
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }

    private var centerStatus: some View {
        matchDateTime
            .fixedSize()
    }

    private var runRow: some View {
        HStack(spacing: Theme.Spacing.s) {
            Image(systemName: "figure.run")
                .font(.system(size: Self.runIconSize, weight: .semibold))
                .foregroundColor(runColor)
            VStack(alignment: .leading, spacing: Self.centerSpacing) {
                Text(event.title)
                    .font(.subheadline.weight(.bold))
                    .lineLimit(1)
                runDetail
            }
            Spacer(minLength: Theme.Spacing.s)
            Text(dateTimeText)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.secondary)
                .lineLimit(1)
                .fixedSize()
        }
        .frame(maxWidth: .infinity)
    }

    private var runDetail: some View {
        HStack(spacing: Self.detailSpacing) {
            if let range = RunDistances.range(meta) {
                Text(range)
                    .foregroundColor(runColor)
            }
        }
        .font(.subheadline.weight(.semibold))
        .lineLimit(1)
    }

    private var matchDateTime: some View {
        VStack(spacing: Self.centerSpacing) {
            Text(shortDate)
                .font(.subheadline.weight(.semibold))
            if let time = event.displayTime {
                Text(time)
                    .font(.subheadline.weight(.regular))
                    .foregroundColor(.secondary)
            }
        }
    }

    private var dateTimeText: String {
        [shortDate, event.displayTime].compactMap { $0 }.joined(separator: Self.separator)
    }

    private var leadingGlow: Color {
        event.isRun ? runColor : tint(meta?.homeColor, name: event.home)
    }

    private var trailingGlow: Color {
        event.isRun ? runColor : tint(meta?.awayColor, name: event.away)
    }

    private var runColor: Color { RunPalette.color(for: event) }

    private func tint(_ hex: String?, name: String?) -> Color {
        if let hex, let color = Color(hexString: hex) { return color }
        return TeamCrest.color(for: name ?? "")
    }

    private var shortDate: String { AppConstants.shortDayFormatter.string(from: event.displayDate) }

    private struct TeamBadge: View {
        let name: String?
        let code: String?
        let colorHex: String?
        let isLeading: Bool

        var body: some View {
            HStack(spacing: TripsGamestrip.badgeSpacing) {
                if isLeading {
                    crest
                    label
                } else {
                    label
                    crest
                }
            }
        }

        private var crest: some View {
            TeamCrest(name: name ?? "", code: code, colorHex: colorHex, size: TripsGamestrip.crestSize)
        }

        private var label: some View {
            VStack(alignment: isLeading ? .leading : .trailing, spacing: 0) {
                Text(code ?? "")
                    .font(.subheadline.weight(.bold))
                if let name, !name.isEmpty {
                    Text(name)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
        }
    }

}
