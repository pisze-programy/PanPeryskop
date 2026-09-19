import SwiftUI

/// How to reach the event: plane or bus. Mirrors StaysAnchorSheet.
struct TransportModeSheet: View {
    @Binding var mode: TransportMode
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            Text("Czym jedziesz")
                .font(Theme.Typo.sectionTitle)
                .padding(Theme.Spacing.l)
            ForEach(TransportMode.allCases) { option in
                SheetOptionRow(title: option.label, isSelected: option == mode) {
                    mode = option
                    dismiss()
                }
                Divider()
            }
        }
        .presentationDetents([.height(220)])
    }
}
