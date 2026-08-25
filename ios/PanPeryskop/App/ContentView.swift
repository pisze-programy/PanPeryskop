import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var authManager: AuthManager
    @Binding var pendingStoryId: String?
    @State private var selectedTab = 0
    @State private var showAddContent = false

    @StateObject private var mapViewModel = MapViewModel()
    @State private var showStoryViewer = false
    @State private var selectedStoryIndex = 0
    @State private var storyPosts: [Post] = []

    var body: some View {
        ZStack(alignment: .bottom) {
            if selectedTab == 0 {
                MapScreen(
                    viewModel: mapViewModel,
                    showStoryViewer: $showStoryViewer,
                    selectedStoryIndex: $selectedStoryIndex,
                    storyPosts: $storyPosts
                )
                .environmentObject(authManager)
            } else {
                ProfileView(onBack: { selectedTab = 0 })
                    .environmentObject(authManager)
            }

            if showStoryViewer {
                StoryFullScreenView(
                    posts: storyPosts,
                    startIndex: selectedStoryIndex,
                    isPresented: $showStoryViewer,
                    viewModel: mapViewModel
                )
                .zIndex(999)
                .transition(.opacity)
            }

            if selectedTab == 0 && !showStoryViewer {
                VStack(spacing: 0) {
                    Spacer()
                    HStack(spacing: 40) {
                        Button(action: {
                            if selectedTab != 0 { Haptics.selection() }
                            selectedTab = 0
                        }) {
                            Image(systemName: "map.fill")
                                .font(.title3)
                                .foregroundColor(selectedTab == 0 ? .accentColor : .gray)
                        }

                        Button(action: {
                            Haptics.impact(.light)
                            showAddContent = true
                        }) {
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 44))
                                .foregroundColor(.accentColor)
                        }

                        Button(action: {
                            if selectedTab != 1 { Haptics.selection() }
                            selectedTab = 1
                        }) {
                            Image(systemName: "person.fill")
                                .font(.title3)
                                .foregroundColor(selectedTab == 1 ? .accentColor : .gray)
                        }
                    }
                    .padding(.horizontal, 40)
                    .padding(.vertical, 12)
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())
                    .shadow(color: .black.opacity(0.15), radius: 10, x: 0, y: 4)
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
                await openPushPost(pushPost)
            } else if let storyId = pendingStoryId {
                pendingStoryId = nil
                await openStory(id: storyId)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .openPushPost)) { note in
            guard let payload = note.object as? PushPostPayload else { return }
            Task { await openPushPost(payload) }
        }
        .onReceive(NotificationCenter.default.publisher(for: .didCaptureMedia)) { _ in
            mapViewModel.selectFeedCategory(.live)
        }
        .onChange(of: pendingStoryId) { _, newId in
            guard let newId else { return }
            pendingStoryId = nil
            Task { await openStory(id: newId) }
        }
        .sheet(isPresented: $showAddContent) {
            AddContentView()
                .environmentObject(authManager)
                .onDisappear { mapViewModel.refreshCurrentRegion() }
        }
    }

    @MainActor
    private func openStory(id: String) async {
        selectedTab = 0
        do {
            if let post = await mapViewModel.ensurePost(id: id) {
                storyPosts = [post]
                selectedStoryIndex = 0
                NotificationCenter.default.post(name: .scrollToPost, object: post)
                try? await Task.sleep(nanoseconds: 700_000_000)
                showStoryViewer = true
            } else {
                ToastManager.shared.show("Błąd: Spróbuj ponownie")
            }
        }
    }

    /// Opens a post from a "new media nearby" push tap: switch the map to the post's category
    /// (so its pin is visible), center + zoom, then open the story preview.
    @MainActor
    private func openPushPost(_ payload: PushPostPayload) async {
        selectedTab = 0
        mapViewModel.selectFeedCategory(FeedCategory(rawValue: payload.category) ?? .live)
        if let post = await mapViewModel.ensurePost(id: payload.postId) {
            storyPosts = [post]
            selectedStoryIndex = 0
            NotificationCenter.default.post(name: .scrollToPost, object: post)
            try? await Task.sleep(nanoseconds: 700_000_000)
            showStoryViewer = true
        } else {
            ToastManager.shared.show("Błąd: Spróbuj ponownie")
        }
    }
}
