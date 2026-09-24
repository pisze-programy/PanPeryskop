import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.scenePhase) private var scenePhase
    @Binding var pendingStoryId: String?

    @StateObject private var mapViewModel = MapViewModel()
    @StateObject private var tripsViewModel = TripsViewModel()
    @State private var router = AppRouter()
    @ObservedObject private var catalogueStore = CatalogueStore.shared

    var body: some View {
        @Bindable var router = router
        return ZStack(alignment: .bottom) {
            if router.showProfile {
                ProfileView(onBack: { router.showProfile = false })
                    .environmentObject(authManager)
            } else {
                MapScreen(
                    category: router.category,
                    onSelectCategory: { router.category = $0 },
                    onProfile: { router.showProfile = true },
                    tripsViewModel: tripsViewModel,
                    showStoryViewer: $router.showStoryViewer,
                    selectedStoryIndex: $router.selectedStoryIndex,
                    storyPosts: $router.storyPosts
                )
                .environmentObject(authManager)
            }

            if router.showStoryViewer {
                StoryFullScreenView(
                    posts: router.storyPosts,
                    startIndex: router.selectedStoryIndex,
                    isPresented: $router.showStoryViewer,
                    actions: mapViewModel
                )
                .zIndex(999)
                .transition(.opacity)
            }
        }
        .ignoresSafeArea(.keyboard)
        .task {
            await catalogueStore.refresh()
            await authManager.refreshMe()
            if let storyId = pendingStoryId {
                pendingStoryId = nil
                await router.openStory(id: storyId, map: mapViewModel)
            }
        }
        .onChange(of: pendingStoryId) { _, newId in
            guard let newId else { return }
            pendingStoryId = nil
            Task { await router.openStory(id: newId, map: mapViewModel) }
        }
        .onChange(of: catalogueStore.catalogue.version) { _, _ in
            mapViewModel.reloadCities()
            tripsViewModel.reloadCatalogue()
        }
        .onChange(of: catalogueStore.updateSuggested) { _, suggested in
            guard suggested else { return }
            ToastManager.shared.show("Dostępna aktualizacja aplikacji", seconds: 3)
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await catalogueStore.refresh() }
        }
    }
}
