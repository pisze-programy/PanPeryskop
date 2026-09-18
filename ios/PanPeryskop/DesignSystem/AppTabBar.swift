import SwiftUI

/// Bottom navigation: local scope + Profile. The Europe scope moves to the
/// Lokalne | Europa segment above the bar.
struct AppTabBar: View {
    let category: MapCategory
    var eventsLoading: Bool = false
    let onSelectCategory: (MapCategory) -> Void
    let onProfile: () -> Void

    var body: some View {
        HStack(spacing: 40) {
            categoryButton(.events, icon: "house.fill", loading: eventsLoading)

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

    @ViewBuilder
    private func categoryButton(_ cat: MapCategory, icon: String, loading: Bool) -> some View {
        Button {
            guard category != cat else { return }
            Haptics.selection()
            onSelectCategory(cat)
        } label: {
            Group {
                if loading {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Image(systemName: icon)
                        .font(.title3)
                        // Lokalne and Europa are both the Home scope.
                        .foregroundColor(.accentColor)
                }
            }
            .frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
        .disabled(loading)
    }
}
