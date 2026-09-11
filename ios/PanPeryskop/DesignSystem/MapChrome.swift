import SwiftUI

/// Bottom category capsule (Wydarzenia / Wycieczki).
struct CategoryPill: View {
    @Binding var selection: MapCategory

    var body: some View {
        HStack(spacing: 4) {
            ForEach(MapCategory.visibleCases) { cat in
                Button {
                    guard selection != cat else { return }
                    Haptics.selection()
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) {
                        selection = cat
                    }
                } label: {
                    Text(cat.label)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.primary)
                        .padding(.horizontal, Theme.Spacing.l)
                        .padding(.vertical, Theme.Spacing.s)
                        .background {
                            if selection == cat {
                                Capsule()
                                    .fill(Theme.Palette.surfaceRaised)
                                    .shadow(color: .black.opacity(0.2), radius: 4, x: 0, y: 2)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.2), lineWidth: 1))
        .shadow(color: Theme.Palette.shadow, radius: 10, x: 0, y: 4)
    }
}

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