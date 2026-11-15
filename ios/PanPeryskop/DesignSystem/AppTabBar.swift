import SwiftUI

struct AppTabBar: View {
    let activeTab: AppTab
    let onSelect: (AppTab) -> Void

    var body: some View {
        HStack(spacing: 40) {
            ForEach(AppTab.allCases) { tab in
                tabButton(for: tab)
            }
        }
        .padding(.horizontal, 36)
        .padding(.vertical, Theme.Spacing.m)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
        .shadow(color: Theme.Palette.shadow, radius: 10, x: 0, y: 4)
    }

    private func tabButton(for tab: AppTab) -> some View {
        Button {
            Haptics.selection()
            onSelect(tab)
        } label: {
            Image(systemName: iconName(for: tab))
                .font(.title3)
                .foregroundColor(activeTab == tab ? .accentColor : .gray)
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel(for: tab))
    }

    private func iconName(for tab: AppTab) -> String {
        switch tab {
        case .map: return "map.fill"
        case .list: return "list.bullet"
        case .profile: return "person.fill"
        }
    }

    private func accessibilityLabel(for tab: AppTab) -> String {
        switch tab {
        case .map: return "Mapa"
        case .list: return "Lista"
        case .profile: return "Profil"
        }
    }
}
