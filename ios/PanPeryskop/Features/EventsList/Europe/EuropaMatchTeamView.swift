import SwiftUI

struct EuropaMatchTeamView: View {
    let name: String
    let code: String?
    let colorHex: String?
    var teamId: String? = nil
    let isLeading: Bool

    private static let crestSize: CGFloat = 38

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            if isLeading {
                crestView
                labelsColumn
            } else {
                labelsColumn
                crestView
            }
        }
        .frame(maxWidth: .infinity, alignment: isLeading ? .leading : .trailing)
    }

    private var crestView: some View {
        TeamCrest(name: name, code: code, colorHex: colorHex, teamId: teamId, size: Self.crestSize)
            .frame(width: Self.crestSize, height: Self.crestSize)
    }

    private var labelsColumn: some View {
        VStack(alignment: isLeading ? .leading : .trailing, spacing: 1) {
            Text(headlineText)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.primary)
                .lineLimit(1)
            subtitleView
        }
    }

    @ViewBuilder
    private var subtitleView: some View {
        if shortCode != nil && !name.isEmpty {
            Text(name)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    private var headlineText: String {
        shortCode ?? name
    }

    private var shortCode: String? {
        guard let trimmed = code?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else { return nil }
        return trimmed
    }
}
