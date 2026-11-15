import SwiftUI

struct StickyDayHeaderView: View {
    let title: String

    var body: some View {
        Text(title)
            .font(Theme.Typo.sectionTitle)
            .foregroundStyle(.primary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.s)
            .background(Color(.systemGroupedBackground))
    }
}
