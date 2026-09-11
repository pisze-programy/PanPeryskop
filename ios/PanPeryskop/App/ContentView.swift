import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var authManager: AuthManager
    @Binding var pendingStoryId: String?

    @StateObject private var mapViewModel = MapViewModel()
    @StateObject private var tripsViewModel = TripsViewModel()
    @State private var router = AppRouter()

    var body: some View {
        @Bindable var router = router
        return ZStack(alignment: .bottom) {
            if router.selectedTab == 0 {
                MapScreen(
                    tripsViewModel: tripsViewModel,
                    showStoryViewer: $router.showStoryViewer,
                    selectedStoryIndex: $router.selectedStoryIndex,
                    storyPosts: $router.storyPosts
                )
                .environmentObject(authManager)
            } else {
                ProfileView(onBack: { router.selectedTab = 0 })
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

            if router.selectedTab == 0 && !router.showStoryViewer {
                VStack(spacing: 0) {
                    Spacer()
                    AppTabBar(selectedTab: $router.selectedTab, onAdd: { router.showAddContent = true })
                        .padding(.bottom, 32)
                }
            }

            ToastView()
        }
        .ignoresSafeArea(.keyboard)
        .task {
            PostUploader.shared.start()
            await authManager.refreshMe()
            if let pushPost = NotificationDelegate.consumePendingPushPost() {
                await router.openPushPost(pushPost, map: mapViewModel)
            } else if let storyId = pendingStoryId {
                pendingStoryId = nil
                await router.openStory(id: storyId, map: mapViewModel)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .openPushPost)) { note in
            guard let payload = note.object as? PushPostPayload else { return }
            Task { await router.openPushPost(payload, map: mapViewModel) }
        }
        .onChange(of: pendingStoryId) { _, newId in
            guard let newId else { return }
            pendingStoryId = nil
            Task { await router.openStory(id: newId, map: mapViewModel) }
        }
        .sheet(isPresented: $router.showAddContent) {
            AddContentView()
                .environmentObject(authManager)
                .onDisappear { mapViewModel.refreshCurrentRegion() }
        }
    }
}