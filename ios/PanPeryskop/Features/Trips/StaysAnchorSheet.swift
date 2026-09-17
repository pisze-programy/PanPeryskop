import SwiftUI

struct StaysAnchorSheet: View {
    @Binding var anchor: StaysAnchor
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            Text("Gdzie szukać noclegu")
                .font(Theme.Typo.sectionTitle)
                .padding(Theme.Spacing.l)
            ForEach(StaysAnchor.allCases) { option in
                SheetOptionRow(title: option.label, isSelected: option == anchor) {
                    anchor = option
                    dismiss()
                }
                Divider()
            }
        }
        .presentationDetents([.height(220)])
    }
}
