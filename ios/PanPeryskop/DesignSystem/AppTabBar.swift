import SwiftUI

/// Bottom navigation: local scope + Profile. The Europe scope moves to the
/// Lokalne | Europa segment above the bar.
struct AppTabBar: View {
    let onHome: () -> Void
    let onProfile: () -> Void

    var body: some View {
        HStack(spacing: 40) {
            tabButton(icon: "house.fill", color: .accentColor, action: onHome)

            Button {
                Haptics.selection()
                onProfile()
            } label: {
                Image(systemName: "person.fill")
                    .font(.title3)
                    .foregroundColor(.gray)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 40)
        .padding(.vertical, Theme.Spacing.m)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
        .shadow(color: Theme.Palette.shadow, radius: 10, x: 0, y: 4)
    }

    private func tabButton(icon: String, color: Color, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.selection()
            action()
        } label: {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(color)
                .frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
    }
}
