import SwiftUI

struct HotelFilterSheet: View {
    @Binding var selection: HotelTier
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            Text("Filtruj noclegi")
                .font(Theme.Typo.sectionTitle)
                .padding(Theme.Spacing.l)
            ForEach(HotelTier.allCases, id: \.self) { tier in
                Button {
                    Haptics.selection()
                    selection = tier
                    dismiss()
                } label: {
                    HStack {
                        Text(tier.label)
                            .font(.body)
                        Spacer()
                        if selection == tier {
                            Image(systemName: "checkmark")
                                .foregroundColor(.accentColor)
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, Theme.Spacing.m)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Divider()
            }
        }
        .presentationDetents([.height(240)])
    }
}
