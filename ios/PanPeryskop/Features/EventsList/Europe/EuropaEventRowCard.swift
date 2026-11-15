import SwiftUI

struct EuropaEventRowCard: View {
    let event: TravelEvent
    let onTap: () -> Void

    @Environment(\.region) private var region

    private static let centerMinWidth: CGFloat = 64
    private static let runIconSize: CGFloat = 38

    var body: some View {
        Button {
            Haptics.selection()
            onTap()
        } label: {
            cardContent
        }
        .buttonStyle(.plain)
    }

    private var cardContent: some View {
        EuropaGamestripCard(
            leadingColor: leadingColor,
            trailingColor: trailingColor
        ) {
            cardBody
        }
    }

    @ViewBuilder
    private var cardBody: some View {
        if event.isRun {
            runContent
        } else {
            matchContent
        }
    }

    private var matchContent: some View {
        VStack(spacing: Theme.Spacing.s) {
            leagueHeader
            matchMainRow
        }
        .padding(Theme.Spacing.m)
    }

    @ViewBuilder
    private var leagueHeader: some View {
        if let league = trimmedLeague {
            Text(league)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .center)
        }
    }

    @ViewBuilder
    private var matchMainRow: some View {
        if hasTeams {
            scoreboardRow
        } else {
            fallbackMatchRow
        }
    }

    private var scoreboardRow: some View {
        HStack(spacing: Theme.Spacing.s) {
            EuropaMatchTeamView(
                name: event.home ?? "",
                code: event.metaData?.homeCode,
                colorHex: event.metaData?.homeColor,
                teamId: event.metaData?.homeId,
                isLeading: true
            )
            matchCenterColumn
            EuropaMatchTeamView(
                name: event.away ?? "",
                code: event.metaData?.awayCode,
                colorHex: event.metaData?.awayColor,
                teamId: event.metaData?.awayId,
                isLeading: false
            )
        }
    }

    private var matchCenterColumn: some View {
        VStack(spacing: 2) {
            Text(validTime ?? "vs")
                .font(.subheadline.weight(.bold).monospacedDigit())
                .foregroundStyle(validTime == nil ? Color.secondary : Color.primary)
                .lineLimit(1)
            Text(event.placeName(language: region.languageCode))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
        }
        .frame(minWidth: Self.centerMinWidth)
    }

    private var fallbackMatchRow: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 2) {
                Text(event.title)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                Text(event.placeName(language: region.languageCode))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            trailingTimeBadge
        }
    }

    private var runContent: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.m) {
            runIcon
            runDetailsColumn
            Spacer(minLength: 0)
            trailingTimeBadge
        }
        .padding(Theme.Spacing.m)
    }

    private var runIcon: some View {
        Image(systemName: "figure.run")
            .font(.title3.weight(.semibold))
            .foregroundStyle(runColor)
            .frame(width: Self.runIconSize, height: Self.runIconSize)
            .background(runColor.opacity(0.14), in: Circle())
    }

    private var runDetailsColumn: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(event.title)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.primary)
                .lineLimit(2)
            runMetaLine
            Text(event.placeName(language: region.languageCode))
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    @ViewBuilder
    private var runMetaLine: some View {
        if let range = RunDistances.range(event.metaData, language: region.languageCode) {
            Text(range)
                .font(.caption.weight(.semibold))
                .foregroundStyle(runColor)
                .lineLimit(1)
        }
    }

    @ViewBuilder
    private var trailingTimeBadge: some View {
        if let time = validTime {
            Text(time)
                .font(.subheadline.weight(.bold).monospacedDigit())
                .foregroundStyle(.primary)
        }
    }

    private var hasTeams: Bool {
        let homeEmpty = (event.home ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let awayEmpty = (event.away ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return !homeEmpty || !awayEmpty
    }

    private var runColor: Color {
        RunPalette.color(for: event)
    }

    private var leadingColor: Color {
        event.isRun ? runColor : teamColor(name: event.home, colorHex: event.metaData?.homeColor)
    }

    private var trailingColor: Color {
        event.isRun ? runColor : teamColor(name: event.away, colorHex: event.metaData?.awayColor)
    }

    private func teamColor(name: String?, colorHex: String?) -> Color {
        if let hex = colorHex, let parsed = Color(hexString: hex) { return parsed }
        return TeamCrest.color(for: name ?? "")
    }

    private var trimmedLeague: String? {
        guard let league = event.metaData?.league?.trimmingCharacters(in: .whitespacesAndNewlines),
              !league.isEmpty else { return nil }
        return league
    }

    private var validTime: String? {
        guard let time = event.displayTime?.trimmingCharacters(in: .whitespacesAndNewlines),
              !time.isEmpty,
              time != AppConstants.unknownTime else { return nil }
        return time
    }
}
