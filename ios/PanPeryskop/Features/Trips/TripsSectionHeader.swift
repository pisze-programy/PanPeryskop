import SwiftUI

/// Section header: a divider, a title and an optional tip button.
struct TripsSectionHeader: View {
    let title: String
    /// Tip shown by the "i" button. nil hides the button.
    var info: String? = nil
    @State private var showInfo = false

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            Divider()
            HStack(spacing: Theme.Spacing.s) {
                Text(title)
                    .font(.headline.weight(.bold))
                Spacer(minLength: 0)
                if let info {
                    Button {
                        Haptics.selection()
                        showInfo.toggle()
                    } label: {
                        Image(systemName: "info.circle")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.secondary)
                    }
                    .buttonStyle(.plain)
                    .popover(isPresented: $showInfo, arrowEdge: .top) {
                        Text(info)
                            .font(.footnote)
                            .foregroundColor(.primary)
                            .padding(Theme.Spacing.m)
                            .frame(maxWidth: 260, alignment: .leading)
                            .presentationCompactAdaptation(.popover)
                    }
                }
            }
        }
    }
}

/// Secondary note under a section.
struct TripsSectionFooter: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption2)
            .foregroundColor(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }
}
