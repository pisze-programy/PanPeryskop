import SwiftUI

/// Section header for the Wycieczki sheet: a divider, a bold headline and an
/// optional "i" button that shows a short tip. Keeps every section visually
/// separated as the sheet grows past the hero + flights.
struct TripsSectionHeader: View {
    let title: String
    /// Short tip shown after tapping "i" (nil hides the button).
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

/// Small secondary note under a section (e.g. "prices are a preview").
struct TripsSectionFooter: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption2)
            .foregroundColor(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }
}
