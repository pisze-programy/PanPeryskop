import SwiftUI

/// Bottom category capsule (Wydarzenia / Wycieczki). Each side can show a small
/// loader that expands the pill outward (Wydarzenia ← left, Wycieczki → right).
struct CategoryPill: View {
    @Binding var selection: MapCategory
    var eventsLoading: Bool = false
    var tripsLoading: Bool = false

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
                    HStack(spacing: 6) {
                        if cat == .events && eventsLoading { loader }
                        Text(cat.label)
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.primary)
                        if cat == .trips && tripsLoading { loader }
                    }
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
                .animation(.spring(response: 0.3, dampingFraction: 0.85), value: eventsLoading)
                .animation(.spring(response: 0.3, dampingFraction: 0.85), value: tripsLoading)
            }
        }
        .padding(4)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.2), lineWidth: 1))
        .shadow(color: Theme.Palette.shadow, radius: 10, x: 0, y: 4)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: eventsLoading)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: tripsLoading)
    }

    private var loader: some View {
        ProgressView()
            .controlSize(.mini)
            .tint(.secondary)
            .transition(.scale.combined(with: .opacity))
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