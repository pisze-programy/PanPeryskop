import SwiftUI

/// Map picker pill (city / airport) — opens a picker sheet.
struct MapPickerPill: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.selection()
            action()
        } label: {
            HStack(spacing: 6) {
                Text(title)
                    .font(.headline)
                    .fontWeight(.semibold)
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.semibold))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, Theme.Spacing.s)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().stroke(Theme.Palette.hairline, lineWidth: 1))
            .shadow(color: Theme.Palette.shadow, radius: 8, x: 0, y: 3)
        }
        .buttonStyle(.plain)
    }
}
