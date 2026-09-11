import SwiftUI

/// Selectable capsule chip for filter bars. Optional count badge (can show at zero).
struct Chip: View {
    let label: String
    let isSelected: Bool
    var badgeCount: Int = 0
    var showsBadgeWhenEmpty: Bool = false
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.selection()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                action()
            }
        } label: {
            Text(label)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(isSelected ? .accentColor : .primary)
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.vertical, 10)
                .background(Capsule().fill(.ultraThinMaterial))
                .overlay(Capsule().fill(isSelected ? Color.accentColor.opacity(0.25) : .clear))
                .overlay(Capsule().stroke(isSelected ? Color.accentColor : Theme.Palette.hairline, lineWidth: isSelected ? 1.5 : 1))
                .shadow(color: Theme.Palette.shadow, radius: 8, x: 0, y: 3)
                .overlay(alignment: .topTrailing) {
                    if badgeCount > 0 || showsBadgeWhenEmpty {
                        Text("\(badgeCount)")
                            .font(.caption2.bold())
                            .foregroundColor(.white)
                            .padding(.horizontal, 5)
                            .frame(minWidth: 16, minHeight: 16)
                            .background(Capsule().fill(Color.accentColor))
                            .overlay(Capsule().stroke(Color.white.opacity(0.3), lineWidth: 0.5))
                            .offset(x: 6, y: -6)
                            .transition(.scale.combined(with: .opacity))
                    }
                }
        }
        .buttonStyle(.plain)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: badgeCount)
    }
}