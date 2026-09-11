import SwiftUI

/// Bottom app tab bar: Map / Add / Profile.
struct AppTabBar: View {
    @Binding var selectedTab: Int
    let onAdd: () -> Void

    var body: some View {
        HStack(spacing: 40) {
            Button {
                if selectedTab != 0 { Haptics.selection() }
                selectedTab = 0
            } label: {
                Image(systemName: "map.fill")
                    .font(.title3)
                    .foregroundColor(selectedTab == 0 ? .accentColor : .gray)
            }

            Button {
                Haptics.impact(.light)
                onAdd()
            } label: {
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: 44))
                    .foregroundColor(.accentColor)
            }

            Button {
                if selectedTab != 1 { Haptics.selection() }
                selectedTab = 1
            } label: {
                Image(systemName: "person.fill")
                    .font(.title3)
                    .foregroundColor(selectedTab == 1 ? .accentColor : .gray)
            }
        }
        .padding(.horizontal, 40)
        .padding(.vertical, Theme.Spacing.m)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
        .shadow(color: Theme.Palette.shadow, radius: 10, x: 0, y: 4)
    }
}